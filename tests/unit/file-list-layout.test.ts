/** @jest-environment jsdom */
import { installFileListLayout } from '../../js/main/file-list-layout';

describe('Mobile file list bounds', () => {
    it('leaves action footer above the actual bottom toolbar and resets desktop/fullscreen sizing', () => {
        document.body.className = 'ui-mode-mobile';
        document.body.innerHTML = '<div id="fileListSidebar" class="show"></div><div class="mobile-bottom-bar"></div>';
        const sidebar = document.getElementById('fileListSidebar')!;
        const bar = document.querySelector<HTMLElement>('.mobile-bottom-bar')!;
        const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) });
        jest.spyOn(sidebar, 'getBoundingClientRect').mockImplementation(() => rect(100, 500));
        jest.spyOn(bar, 'getBoundingClientRect').mockImplementation(() => rect(700, 68));
        const frames: FrameRequestCallback[] = [];
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length; });
        const cleanup = installFileListLayout(); frames.shift()!(0);
        expect(sidebar.style.maxHeight).toBe('590px');
        document.body.classList.add('file-management-mode'); window.dispatchEvent(new Event('resize')); frames.shift()!(0);
        expect(sidebar.style.maxHeight).toBe('');
        document.body.className = 'ui-mode-desktop'; window.dispatchEvent(new Event('resize')); frames.shift()!(0);
        expect(sidebar.style.maxHeight).toBe(''); cleanup();
    });
});
