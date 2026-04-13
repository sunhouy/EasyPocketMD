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

export function renderDiffView(diffResult: any[], isEn: boolean, collapseSame = true): string {
  let html = '';
  let leftLine = 1;
  let rightLine = 1;
  let hiddenSameCount = 0;
  let hiddenSameRows: any[] = [];
  let hasRealDiff = false;
  let collapseSeq = 0;

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
      if (collapseSame) {
        hiddenSameCount += 1;
        hiddenSameRows.push({ leftLineNo: leftLine, rightLineNo: rightLine, left: item.left || '', right: item.right || '' });
      } else {
        html += renderSameDiffRowHTML(leftLine, rightLine, item.left || '', item.right || '', '', '');
      }
      leftLine += 1;
      rightLine += 1;
      return;
    }

    hasRealDiff = true;
    flushCollapsedSame();

    if (item.type === 'removed') {
      html += `<div class="diff-line diff-removed"><div class="diff-line-num">${leftLine}</div><div class="diff-line-content"><pre>${escapeHtml(
        item.left,
      )}</pre></div><div class="diff-line-num">-</div><div class="diff-line-content diff-empty"></div></div>`;
      leftLine += 1;
    } else if (item.type === 'added') {
      html += `<div class="diff-line diff-added"><div class="diff-line-num">-</div><div class="diff-line-content diff-empty"></div><div class="diff-line-num">${rightLine}</div><div class="diff-line-content"><pre>${escapeHtml(
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
