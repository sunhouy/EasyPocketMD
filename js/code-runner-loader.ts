(function(global) {
    'use strict';

    var SUPPORTED_LANGUAGES = new Set(['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'html', 'htm', 'c', 'cpp', 'c++']);
    var loadPromise = null;
    var lazyLoadInitialized = false;

    function getLanguageFromCodeBlock(codeBlock) {
        return String(codeBlock && codeBlock.className ? codeBlock.className : '')
            .replace('language-', '')
            .split(' ')[0]
            .toLowerCase();
    }

    function isEditableCodeBlock(codeBlock) {
        if (!codeBlock || !codeBlock.closest) return false;
        return !!codeBlock.closest('.vditor-ir__input, textarea, input');
    }

    function isRunnableCodeBlock(codeBlock) {
        if (!codeBlock || !codeBlock.isConnected) return false;
        if (isEditableCodeBlock(codeBlock)) return false;
        return SUPPORTED_LANGUAGES.has(getLanguageFromCodeBlock(codeBlock));
    }

    function getCodeBlockFromTarget(target) {
        if (!target || !target.closest) return null;
        var codeNode = target.closest('pre code');
        if (codeNode) return codeNode;
        var preNode = target.closest('pre');
        if (preNode && preNode.querySelector) {
            return preNode.querySelector('code');
        }
        return null;
    }

    function ensureCodeRunnerLoaded() {
        if (loadPromise) return loadPromise;

        loadPromise = import('./code-runner').then(function() {
            if (typeof global.addRunButtons === 'function') {
                global.addRunButtons();
            }
        }).catch(function(error) {
            loadPromise = null;
            console.error('Failed to load code runner module:', error);
            throw error;
        });

        return loadPromise;
    }

    function maybeLoadForTarget(target) {
        var codeBlock = getCodeBlockFromTarget(target);
        if (!isRunnableCodeBlock(codeBlock)) return;
        void ensureCodeRunnerLoaded();
    }

    function initCodeRunnerLazyLoad() {
        if (lazyLoadInitialized) return;
        lazyLoadInitialized = true;

        document.addEventListener('mousemove', function(event) {
            maybeLoadForTarget(event.target);
        }, true);

        document.addEventListener('click', function(event) {
            maybeLoadForTarget(event.target);
        }, true);
    }

    global.initCodeRunnerLazyLoad = initCodeRunnerLazyLoad;
    global.ensureCodeRunnerLoaded = ensureCodeRunnerLoaded;
})(typeof window !== 'undefined' ? window : this);
