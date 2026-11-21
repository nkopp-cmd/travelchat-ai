// Push BT2: a mistyped domain never gets the verify mail, so the sign-up is lost.
// Code only (no API): a fixed table of common domain typos -> the intended domain.

const DOMAIN_FIXES: Record<string, string> = {
    // gmail.com
    "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com",
    "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com",
    "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmail.cpm": "gmail.com", "gmail.comm": "gmail.com",
    "gmali.com": "gmail.com", "gmaik.com": "gmail.com", "gmil.com": "gmail.com",
    // hotmail.com
    "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "homail.com": "hotmail.com",
    "hotmil.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmail.co": "hotmail.com", "hotmaill.com": "hotmail.com",
    // yahoo.com
    "yahoo.con": "yahoo.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yhoo.com": "yahoo.com",
    "yahoo.cm": "yahoo.com", "yahoo.co": "yahoo.com", "yahho.com": "yahoo.com",
    // outlook.com
    "outlok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.con": "outlook.com", "outllook.com": "outlook.com",
    "outlook.co": "outlook.com", "otlook.com": "outlook.com",
    // icloud.com
    "icloud.con": "icloud.com", "iclod.com": "icloud.com", "icoud.com": "icloud.com", "icloud.co": "icloud.com",
    "iclould.com": "icloud.com",
    // naver.com (Korea)
    "naver.con": "naver.com", "nave.com": "naver.com", "naver.co": "naver.com", "navr.com": "naver.com",
    // daum.net / hanmail.net (Korea)
    "daum.ner": "daum.net", "daum.nte": "daum.net", "hanmail.ner": "hanmail.net", "hanmial.net": "hanmail.net",
};

/** The corrected address when the domain is a known typo, else null. */
export function emailTypoFix(email: string): string | null {
    const value = email.trim();
    const at = value.lastIndexOf("@");
    if (at < 1 || at === value.length - 1) return null;
    const fix = DOMAIN_FIXES[value.slice(at + 1).toLowerCase()];
    return fix ? `${value.slice(0, at)}@${fix}` : null;
}
