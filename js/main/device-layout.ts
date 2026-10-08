/** ArkWeb phone UAs use OpenHarmony + Mobile rather than Android. */
export function isMobileUserAgent(userAgent: string): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|\bMobile\b/i.test(userAgent)
        || (/OpenHarmony|HarmonyOS/i.test(userAgent) && /\bPhone\b|\bTablet\b/i.test(userAgent));
}
