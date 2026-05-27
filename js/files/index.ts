// Orchestration entry for file subsystem.
import './runtime';

import './types';
import './saveState';
import './autoSave';
import './sync/index';
import './tree/index';
import './external/index';

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

installExternalUi(window);

export {};
