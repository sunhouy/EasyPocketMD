declare module 'diff-match-patch' {
    export default class DiffMatchPatch {
        Diff_Timeout: number;
        diff_main(left: string, right: string, checklines?: boolean): Array<[number, string]>;
        diff_xIndex(diffs: Array<[number, string]>, offset: number): number;
        [key: string]: any;
    }
}
