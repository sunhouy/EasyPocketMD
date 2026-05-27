export function computeDiff(globalRef: any, leftText: string, rightText: string): any[] {
  const wasmDiff = globalRef.wasmTextEngineGateway.diff(leftText, rightText);
  if (!Array.isArray(wasmDiff)) {
    throw new Error('WASM diff returned invalid data');
  }
  return wasmDiff;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export type HunkDecision = 'left' | 'right' | 'auto';

export interface DiffHunk {
  id: number;
  items: any[];
  startIndex: number;
}

export interface RenderDiffViewOptions {
  collapseSame?: boolean;
  markHunks?: boolean;
  activeHunkId?: number | null;
  resolvedHunkIds?: Set<number> | number[];
}

function renderSameDiffRowHTML(
  leftLineNo: number,
  rightLineNo: number,
  leftText: string,
  rightText: string,
  extraClass: string,
  expandedFromId: string,
): string {
  const cls = extraClass ? ` ${extraClass}` : '';
  const expandedAttr = expandedFromId ? ` data-expanded-from="${expandedFromId}"` : '';
  return `<div class="diff-line diff-same${cls}"${expandedAttr}><div class="diff-line-num">${leftLineNo}</div><div class="diff-line-content"><pre>${escapeHtml(leftText)}</pre></div><div class="diff-line-num">${rightLineNo}</div><div class="diff-line-content"><pre>${escapeHtml(rightText)}</pre></div></div>`;
}

export function groupDiffIntoHunks(diffResult: any[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let startIndex = 0;

  (diffResult || []).forEach((item, idx) => {
    if (item.type === 'same') {
      if (current) {
        hunks.push(current);
        current = null;
      }
      return;
    }
    if (!current) {
      startIndex = idx;
      current = { id: hunks.length, items: [], startIndex };
    }
    current.items.push(item);
  });

  if (current) hunks.push(current);
  return hunks;
}

function linesFromHunkSide(items: any[], side: 'left' | 'right'): string[] {
  const lines: string[] = [];
  items.forEach((item) => {
    if (side === 'left') {
      if (item.type === 'removed' || item.type === 'same') lines.push(item.left ?? '');
    } else if (item.type === 'added' || item.type === 'same') {
      lines.push(item.right ?? '');
    }
  });
  return lines;
}

export function applyHunkDecision(
  items: any[],
  decision: HunkDecision,
  merge3Fn?: (base: string, left: string, right: string) => { mergedText?: string; hasConflict?: boolean } | null,
): string[] {
  const leftLines = linesFromHunkSide(items, 'left');
  const rightLines = linesFromHunkSide(items, 'right');

  if (decision === 'left') return leftLines.length ? leftLines : [''];
  if (decision === 'right') return rightLines.length ? rightLines : [''];

  if (!leftLines.length) return rightLines.length ? rightLines : [''];
  if (!rightLines.length) return leftLines;

  if (merge3Fn) {
    const leftText = leftLines.join('\n');
    const rightText = rightLines.join('\n');
    const res = merge3Fn('', leftText, rightText);
    if (res && typeof res.mergedText === 'string' && !res.hasConflict) {
      return res.mergedText.split('\n');
    }
  }

  return rightLines;
}

export function buildMergedTextFromDiff(
  diffResult: any[],
  hunkDecisions: Record<number, HunkDecision>,
  merge3Fn?: (base: string, left: string, right: string) => { mergedText?: string; hasConflict?: boolean } | null,
): string {
  const hunks = groupDiffIntoHunks(diffResult);
  const lines: string[] = [];
  let hunkIdx = 0;
  let i = 0;
  const items = diffResult || [];

  while (i < items.length) {
    const item = items[i];
    if (item.type === 'same') {
      lines.push(item.left ?? '');
      i += 1;
      continue;
    }

    const hunk = hunks[hunkIdx];
    if (!hunk) break;

    const decision = hunkDecisions[hunk.id] ?? 'auto';
    lines.push(...applyHunkDecision(hunk.items, decision, merge3Fn));
    i += hunk.items.length;
    hunkIdx += 1;
  }

  return lines.join('\n');
}

export function smartMergeTexts(
  globalRef: any,
  leftText: string,
  rightText: string,
): { mergedText: string; conflictCount: number; hasConflict: boolean; conflicts: any[] } {
  const gw = globalRef.wasmTextEngineGateway;
  if (gw && typeof gw.merge3 === 'function') {
    const res = gw.merge3('', leftText || '', rightText || '', 'manual');
    if (res && res.code === 200 && res.data) {
      return {
        mergedText: res.data.mergedText || '',
        conflictCount: Number(res.data.conflictCount || 0),
        hasConflict: !!res.data.hasConflict,
        conflicts: Array.isArray(res.data.conflicts) ? res.data.conflicts : [],
      };
    }
  }

  const diffResult = computeDiff(globalRef, leftText || '', rightText || '');
  const merge3Fn = gw && typeof gw.merge3 === 'function'
    ? (base: string, local: string, remote: string) => {
        const r = gw.merge3(base, local, remote, 'manual');
        if (r && r.code === 200 && r.data) return r.data;
        return null;
      }
    : undefined;

  return {
    mergedText: buildMergedTextFromDiff(diffResult, {}, merge3Fn),
    conflictCount: 0,
    hasConflict: false,
    conflicts: [],
  };
}

export function bindCollapsedDiffInteractions(diffContainer: HTMLElement | null): void {
  if (!diffContainer) return;

  diffContainer.querySelectorAll('.diff-collapsed[data-collapse-id]').forEach((row) => {
    const el = row as HTMLElement;
    if (el.dataset.boundToggle === '1') return;
    el.dataset.boundToggle = '1';

    el.addEventListener('click', () => {
      const collapseId = el.getAttribute('data-collapse-id');
      if (!collapseId) return;

      if (el.classList.contains('is-expanded')) {
        diffContainer.querySelectorAll(`.diff-line[data-expanded-from="${collapseId}"]`).forEach((expandedRow) => {
          expandedRow.remove();
        });
        el.classList.remove('is-expanded');
        return;
      }

      const encodedSegment = el.getAttribute('data-collapsed-segment') || '';
      if (!encodedSegment) return;

      let rows: any[] = [];
      try {
        rows = JSON.parse(decodeURIComponent(encodedSegment));
      } catch {
        rows = [];
      }
      if (!Array.isArray(rows) || rows.length === 0) return;

      const expandedHtml = rows
        .map((item) =>
          renderSameDiffRowHTML(item.leftLineNo, item.rightLineNo, item.left || '', item.right || '', 'diff-same-unfolded', collapseId),
        )
        .join('');

      el.insertAdjacentHTML('afterend', expandedHtml);
      el.classList.add('is-expanded');
    });
  });
}

export function setAllCollapsedSectionsExpanded(diffContainer: HTMLElement | null, expand: boolean): void {
  if (!diffContainer) return;

  diffContainer.querySelectorAll('.diff-collapsed[data-collapse-id]').forEach((row) => {
    const el = row as HTMLElement;
    const isExpanded = el.classList.contains('is-expanded');
    if (expand && !isExpanded) el.click();
    if (!expand && isExpanded) el.click();
  });
}

export function renderDiffView(diffResult: any[], isEn: boolean, options: boolean | RenderDiffViewOptions = true): string {
  const opts: RenderDiffViewOptions =
    typeof options === 'boolean' ? { collapseSame: options } : options || {};
  const collapseSame = opts.collapseSame !== false;
  const markHunks = !!opts.markHunks;
  const activeHunkId = opts.activeHunkId ?? null;
  const resolvedSet = new Set(
    Array.isArray(opts.resolvedHunkIds) ? opts.resolvedHunkIds : opts.resolvedHunkIds ? [...opts.resolvedHunkIds] : [],
  );

  let html = '';
  let leftLine = 1;
  let rightLine = 1;
  let hiddenSameCount = 0;
  let hiddenSameRows: any[] = [];
  let hasRealDiff = false;
  let collapseSeq = 0;
  let currentHunkId: number | null = null;
  let hunkCounter = 0;

  function flushCollapsedSame() {
    if (!collapseSame || hiddenSameCount <= 0) return;
    collapseSeq += 1;
    const collapseId = `diff-collapse-${collapseSeq}`;
    const payload = encodeURIComponent(JSON.stringify(hiddenSameRows));
    html +=
      `<div class="diff-line diff-collapsed" data-collapse-id="${collapseId}" data-collapsed-segment="${payload}">` +
      `<div class="diff-line-content" style="grid-column:1 / -1;"><pre>${escapeHtml(
        `${isEn ? '[Folded ' : '[已折叠 '}${hiddenSameCount}${isEn ? ' identical line(s), click to expand]' : ' 行相同内容，点击展开]'}`,
      )}</pre></div></div>`;
    hiddenSameCount = 0;
    hiddenSameRows = [];
  }

  (diffResult || []).forEach((item) => {
    if (item.type === 'same') {
      currentHunkId = null;
      if (collapseSame) {
        hiddenSameCount += 1;
        hiddenSameRows.push({ leftLineNo: leftLine, rightLineNo: rightLine, left: item.left || '', right: item.right || '' });
      } else {
        html += renderSameDiffRowHTML(leftLine, rightLine, item.left || '', item.right || '', '', '', '');
      }
      leftLine += 1;
      rightLine += 1;
      return;
    }

    hasRealDiff = true;
    flushCollapsedSame();

    if (currentHunkId === null) {
      currentHunkId = hunkCounter;
      hunkCounter += 1;
    }
    const hunkAttrs = hunkAttrString(currentHunkId, markHunks, activeHunkId, resolvedSet);

    if (item.type === 'removed') {
      html += `<div class="diff-line diff-removed${markHunks ? ' diff-hunk' : ''}${currentHunkId === activeHunkId ? ' diff-hunk-active' : ''}${resolvedSet.has(currentHunkId) ? ' diff-hunk-resolved' : ''}"${markHunks ? ` data-hunk-id="${currentHunkId}"` : ''}><div class="diff-line-num">${leftLine}</div><div class="diff-line-content"><pre>${escapeHtml(
        item.left,
      )}</pre></div><div class="diff-line-num">-</div><div class="diff-line-content diff-empty"></div></div>`;
      leftLine += 1;
    } else if (item.type === 'added') {
      html += `<div class="diff-line diff-added${markHunks ? ' diff-hunk' : ''}${currentHunkId === activeHunkId ? ' diff-hunk-active' : ''}${resolvedSet.has(currentHunkId) ? ' diff-hunk-resolved' : ''}"${markHunks ? ` data-hunk-id="${currentHunkId}"` : ''}><div class="diff-line-num">-</div><div class="diff-line-content diff-empty"></div><div class="diff-line-num">${rightLine}</div><div class="diff-line-content"><pre>${escapeHtml(
        item.right,
      )}</pre></div></div>`;
      rightLine += 1;
    }
  });

  flushCollapsedSame();

  if (!hasRealDiff) {
    return `<div class="diff-line diff-collapsed"><div class="diff-line-content" style="grid-column:1 / -1;"><pre>${escapeHtml(
      isEn ? 'No differences' : '无差异内容',
    )}</pre></div></div>`;
  }
  return html;
}
