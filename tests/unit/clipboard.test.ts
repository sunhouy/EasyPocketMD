/** @jest-environment jsdom */
import { copyText } from '../../js/clipboard';

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => jest.restoreAllMocks());
function clipboard(writeText?: jest.Mock) {
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value: writeText ? {writeText} : undefined});
}
it.each(['x^2 + y^2 = z^2', 'graph TD\nA-->B', '{"series":[{"type":"bar","data":[1,2]}]}'])('copies exact formula/chart source through the Clipboard API: %s', async source => {
    const write = jest.fn().mockResolvedValue(undefined); clipboard(write);
    await copyText(source); expect(write).toHaveBeenCalledWith(source);
});
it.each(['missing', 'denied'])('falls back when the Clipboard API is %s and restores the editor selection', async mode => {
    clipboard(mode === 'denied' ? jest.fn().mockRejectedValue(new Error('NotAllowedError')) : undefined);
    document.body.innerHTML='<textarea id="draft">before selected after</textarea>';
    const draft=document.querySelector('textarea')!; draft.focus();draft.setSelectionRange(7,15);
    document.execCommand=jest.fn(() => {
        const input=document.activeElement as HTMLTextAreaElement;
        expect(input.value).toBe('graph TD\nA-->B'); expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(input.value.length);
        return true;
    });
    await copyText('graph TD\nA-->B');
    expect(document.execCommand).toHaveBeenCalledWith('copy');expect(document.activeElement).toBe(draft);
    expect([draft.selectionStart,draft.selectionEnd]).toEqual([7,15]);expect(draft.value).toBe('before selected after');
    expect(document.querySelectorAll('textarea')).toHaveLength(1);
});
it('keeps fallback focus in a dialog and cleans up on failure', async () => {
    clipboard();document.body.innerHTML='<div role="dialog"><button>Copy</button></div>';
    const button=document.querySelector('button')!;button.focus();
    document.execCommand=jest.fn(() => {expect(document.querySelector('[role=dialog]')!.contains(document.activeElement)).toBe(true);return false;});
    await expect(copyText('x^2')).rejects.toThrow('Clipboard unavailable');
    expect(document.querySelector('textarea')).toBeNull();expect(document.activeElement).toBe(button);
});
