// @ts-nocheck

// Orchestration entry for file subsystem.
import './runtime';
import {
	computeDiff,
	renderDiffView,
	bindCollapsedDiffInteractions,
} from './conflict/index';

import './types';
import './saveState';
import './autoSave';
import './sync/index';
import './tree/index';
import './external/index';

function isEn() {
	return window.i18n && window.i18n.getLanguage() === 'en';
}

function installConflictUi(globalRef) {
	const core = globalRef.__filesCoreHandlers || {};

	globalRef.showDiffModal = function(conflict) {
		const diffModal = document.getElementById('diffModalOverlay');
		const diffContent = document.getElementById('diffContent');
		const diffFileName = document.getElementById('diffFileName');
		const diffLocalTime = document.getElementById('diffLocalTime');
		const diffServerTime = document.getElementById('diffServerTime');
		if (!diffModal || !diffContent) {
			if (typeof core.showDiffModal === 'function') return core.showDiffModal(conflict);
			return;
		}

		diffFileName.textContent = conflict.filename;
		diffLocalTime.textContent = new Date(conflict.localModified).toLocaleString();
		diffServerTime.textContent = new Date(conflict.serverModified).toLocaleString();

		const diffResult = computeDiff(globalRef, conflict.localContent || '', conflict.serverContent || '');
		diffContent.innerHTML = renderDiffView(diffResult || [], isEn(), true);
		bindCollapsedDiffInteractions(diffContent);
		diffModal.classList.add('show');

		const closeModal = function() { diffModal.classList.remove('show'); };
		const closeBtn = document.getElementById('closeDiffBtn');
		const closeModalBtn = document.getElementById('closeDiffModalBtn');
		if (closeBtn) closeBtn.onclick = closeModal;
		if (closeModalBtn) closeModalBtn.onclick = closeModal;
		diffModal.onclick = function(e) { if (e.target === diffModal) closeModal(); };
	};

	globalRef.showMergePreviewModal = function(conflict) {
		if (typeof core.showMergePreviewModal === 'function') {
			return core.showMergePreviewModal(conflict);
		}
		return globalRef.showDiffModal(conflict);
	};
	globalRef.showMergePreview = globalRef.showMergePreviewModal;

	globalRef.showConflictResolution = function(conflicts, serverFiles, preserveFileName) {
		if (typeof core.showConflictResolution === 'function') {
			return core.showConflictResolution(conflicts, serverFiles, preserveFileName);
		}
	};

	globalRef.showSaveConflictDialog = function(conflict) {
		if (typeof core.showSaveConflictDialog === 'function') {
			return core.showSaveConflictDialog(conflict);
		}
	};
}

function installExternalUi(globalRef) {
	const core = globalRef.__filesCoreHandlers || {};
	if (typeof core.openExternalLocalFileByDialog === 'function') {
		globalRef.openExternalLocalFileByDialog = core.openExternalLocalFileByDialog;
	}
	if (typeof core.openExternalLocalFileByPath === 'function') {
		globalRef.openExternalLocalFileByPath = core.openExternalLocalFileByPath;
	}
	if (typeof core.startExternalLocalConflictMonitor === 'function') {
		globalRef.startExternalLocalConflictMonitor = core.startExternalLocalConflictMonitor;
		// Start monitor from composition entry so runtime-core remains init-light.
		globalRef.startExternalLocalConflictMonitor();
	}
}

installConflictUi(window);
installExternalUi(window);

export {};
