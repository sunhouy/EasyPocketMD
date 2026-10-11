/** @jest-environment jsdom */
import { installFileListLayout } from '../../js/main/file-list-layout';

describe('Mobile file list bounds', () => {
    it('leaves action footer inside the visual viewport and resets desktop/fullscreen sizing', () => {
        document.body.className = 'ui-mode-mobile';
        document.body.innerHTML = '<div id="fileListSidebar" class="show"></div>';
        const sidebar = document.getElementById('fileListSidebar')!;
        const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) });
        jest.spyOn(sidebar, 'getBoundingClientRect').mockImplementation(() => rect(100, 500));
        const frames: FrameRequestCallback[] = [];
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length; });
        const cleanup = installFileListLayout(); frames.shift()!(0);
        expect(sidebar.style.maxHeight).toBe(window.innerHeight - 110 + 'px');
        document.body.classList.add('file-management-mode'); window.dispatchEvent(new Event('resize')); frames.shift()!(0);
        expect(sidebar.style.maxHeight).toBe('');
        document.body.className = 'ui-mode-desktop'; window.dispatchEvent(new Event('resize')); frames.shift()!(0);
        expect(sidebar.style.maxHeight).toBe(''); cleanup();
    });
});
