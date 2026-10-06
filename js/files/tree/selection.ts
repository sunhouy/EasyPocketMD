/** Restoring the editor's selected node must not recursively toggle multi-selection. */
export function createTreeSelectionRestorer() {
    let restoring = false;
    return {
        isRestoring: () => restoring,
        restore(tree: any, clickedId: string, currentId?: string) {
            restoring = true;
            try {
                tree.deselect_node(clickedId);
                if (currentId && tree.get_node(currentId)) tree.select_node(currentId);
            } finally {restoring = false;}
        }
    };
}
