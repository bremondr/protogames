/* feedback-kit: every text the kit shows or writes, by language. No DOM, so it runs in plain Node too.

   createFeedback({language, strings}) and issueUrl({language, strings}) pick a set with texts(language, strings):
     language  'en' (default) or 'cs'. Another code works with `strings` that give the texts: what they leave out
               is English
     strings   {key: text} over the chosen set, to change single texts: {openIssue: 'Report it on {provider}'}

   Texts with {name} in them are templates: the kit puts the value in, wherever the language wants it. Every
   language has every key (issue.test.mjs checks it), with the same {names} as English.

   provider.github, provider.gitlab: the provider's name as it goes into openIssue and issueNote, for a language
   whose grammar changes the name (in Czech it is the plain name: "Napsat hlášení na GitHub", "GitHub otevře"). */

export const STRINGS = {
  en: {
    // the panel
    heading: 'Send feedback',
    pictureLabel: 'Just this part',
    close: 'Close',
    canvasLabel: 'Picture of the screen. Draw on it to point at the problem.',
    making: 'Making the picture…',
    pickLabel: 'Picture',
    kindPage: 'Whole page',
    kindOwn: 'Your screenshot',
    kindScreen: 'Screen capture',
    grab: 'Take a real screenshot',
    mine: 'Use my screenshot…',
    mineNote: 'Or paste a screenshot (Ctrl+V, ⌘V) or drop one on the picture.',
    pensLabel: 'Pen colour',
    penRed: 'Red',
    penWhite: 'White',
    penBlue: 'Blue',
    penBlack: 'Black',
    penLabel: '{pen} pen',
    undo: 'Undo',
    clear: 'Clear',
    drawNote: 'Draw on the picture to point at the problem.',
    openIssue: 'Write the issue on {provider}',
    'provider.github': 'GitHub',
    'provider.gitlab': 'GitLab',
    copy: 'Copy picture',
    share: 'Share…',
    save: 'Save picture',
    issueNote: 'The issue opens on {provider} with what was on screen filled in. Sign in, paste the picture, say what’s wrong, and tap Submit.',
    fileName: 'feedback.png',
    // what the panel says under the picture
    copied: 'The picture is copied. Paste it into the issue, or draw on it first.',
    copiedDrawing: 'The picture is copied, with your drawing. Paste it into the issue.',
    notCopied: 'Couldn’t copy the picture here. Save or share it, then attach it to the issue.',
    drawThen: 'Draw on the picture, then copy, save or share it for the issue.',
    ownIn: 'Your screenshot is in. Draw on it, then copy, save or share it for the issue.',
    notPicture: 'That isn’t a picture. Drop a screenshot (PNG or JPEG).',
    unreadable: 'That picture couldn’t be read. Try a PNG or JPEG screenshot.',
    noPicture: 'No picture in this browser.',
    noPictureNote: 'Couldn’t make a picture here. The issue still says what was on screen.',
    noCapture: 'No screen capture, so the picture is the one made from the page. Your own screenshot works too.',
    tooLong: 'Too long to put in the issue: {sections}. It has a shorter note in its place, so add that part by hand if it matters.',
    // the issue
    issueWhat: 'What’s wrong, and what should happen',
    issuePicture: 'Picture',
    issuePictureHint: 'The picture was copied: paste it here, or attach the saved picture.',
    issueOnScreen: 'On screen',
    // the device's rows in the issue
    rowScreen: 'Screen',
    rowWindow: 'Window',
    rowBrowser: 'Browser',
    rowPage: 'Page',
    screen: '{width} × {height} px, {orientation}, pixel ratio {ratio}, {theme}',
    screenApp: '{width} × {height} px, {orientation}, pixel ratio {ratio}, {theme}, home screen app',
    landscape: 'landscape',
    portrait: 'portrait',
    lightMode: 'light mode',
    darkMode: 'dark mode',
    decimal: '.',
    window: '{width} × {height} px on a {screenWidth} × {screenHeight} px screen'
  },
  cs: {
    heading: 'Poslat zpětnou vazbu',
    pictureLabel: 'Jen tuto část',
    close: 'Zavřít',
    canvasLabel: 'Snímek obrazovky. Kreslením do něj ukažte, kde je problém.',
    making: 'Připravuji snímek obrazovky…',
    pickLabel: 'Snímek obrazovky',
    kindPage: 'Celá stránka',
    kindOwn: 'Váš snímek obrazovky',
    kindScreen: 'Snímek obrazovky',
    grab: 'Pořídit skutečný snímek obrazovky',
    mine: 'Použít vlastní snímek obrazovky…',
    mineNote: 'Vlastní snímek obrazovky můžete také vložit (Ctrl+V, ⌘V) nebo přetáhnout sem.',
    pensLabel: 'Barva pera',
    penRed: 'Červená',
    penWhite: 'Bílá',
    penBlue: 'Modrá',
    penBlack: 'Černá',
    penLabel: '{pen} barva pera',
    undo: 'Zpět',
    clear: 'Vymazat',
    drawNote: 'Kreslením do snímku obrazovky ukažte, kde je problém.',
    openIssue: 'Napsat hlášení na {provider}',
    'provider.github': 'GitHub',
    'provider.gitlab': 'GitLab',
    copy: 'Kopírovat snímek obrazovky',
    share: 'Sdílet…',
    save: 'Uložit snímek obrazovky',
    issueNote: '{provider} otevře nové předvyplněné hlášení. Přihlaste se, vložte snímek obrazovky, napište, co je špatně, a hlášení odešlete.',
    fileName: 'zpetna-vazba.png',
    copied: 'Snímek obrazovky je zkopírovaný. Vložte ho do hlášení, nebo do něj nejdřív nakreslete, co je špatně.',
    copiedDrawing: 'Snímek obrazovky je zkopírovaný i s vaší kresbou. Vložte ho do hlášení.',
    notCopied: 'Snímek obrazovky se nepodařilo zkopírovat. Uložte ho nebo ho sdílejte a pak ho přiložte k hlášení.',
    drawThen: 'Nakreslete do snímku obrazovky, kde je problém, a pak ho pro hlášení zkopírujte, uložte nebo sdílejte.',
    ownIn: 'Váš snímek obrazovky je tu. Nakreslete do něj, kde je problém, a pak ho pro hlášení zkopírujte, uložte nebo sdílejte.',
    notPicture: 'To není obrázek. Přetáhněte sem snímek obrazovky (PNG nebo JPEG).',
    unreadable: 'Obrázek se nepodařilo načíst. Zkuste snímek obrazovky ve formátu PNG nebo JPEG.',
    noPicture: 'V tomto prohlížeči snímek obrazovky vytvořit nejde.',
    noPictureNote: 'Snímek obrazovky se tu nepodařilo vytvořit. Hlášení i tak uvede, co bylo na obrazovce.',
    noCapture: 'Obrazovku se nepodařilo zachytit, takže snímek obrazovky je vytvořený ze stránky. Můžete použít i vlastní snímek.',
    tooLong: 'Do hlášení se nevešlo: {sections}. Je v něm místo toho kratší poznámka, takže pokud na tom záleží, doplňte to ručně.',
    issueWhat: 'Co je špatně a co by se mělo stát',
    issuePicture: 'Snímek obrazovky',
    issuePictureHint: 'Snímek obrazovky je zkopírovaný: vložte ho sem, nebo přiložte uložený soubor.',
    issueOnScreen: 'Na obrazovce',
    rowScreen: 'Obrazovka',
    rowWindow: 'Okno',
    rowBrowser: 'Prohlížeč',
    rowPage: 'Stránka',
    screen: '{width} × {height} px, {orientation}, poměr pixelů {ratio}, {theme}',
    screenApp: '{width} × {height} px, {orientation}, poměr pixelů {ratio}, {theme}, aplikace na ploše',
    landscape: 'na šířku',
    portrait: 'na výšku',
    lightMode: 'světlý režim',
    darkMode: 'tmavý režim',
    decimal: ',',
    window: '{width} × {height} px na obrazovce {screenWidth} × {screenHeight} px'
  }
};

export const LANGUAGES = Object.keys(STRINGS);

// a template's text with each {name} replaced by its value; a {name} with no value stays as it is
export const format = (template, values = {}) => String(template).replace(/\{(\w+)\}/g, (all, name) => Object.hasOwn(values, name) ? String(values[name]) : all);

/* The texts for a language, with `strings` over them. Throws when the language is unknown and no strings are given,
   and on a key the kit doesn't have (a typo would otherwise change nothing, silently). */
export function texts(language = 'en', strings = null){
  if (typeof language !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(language))
    throw new Error(`feedback-kit: language must be a language code such as 'en' or 'cs' (got ${JSON.stringify(language)})`);
  if (strings !== null && strings !== undefined && (typeof strings !== 'object' || Array.isArray(strings)))
    throw new Error('feedback-kit: strings must be an object of texts, {key: text}');
  const own = Object.hasOwn(STRINGS, language) ? STRINGS[language] : null;
  if (!own && !strings) throw new Error(`feedback-kit: no texts for the language ${JSON.stringify(language)} (built in: ${LANGUAGES.map(l => `'${l}'`).join(', ')}); give them in strings`);
  for (const [key, text] of Object.entries(strings || {})){
    if (!Object.hasOwn(STRINGS.en, key)) throw new Error(`feedback-kit: strings has an unknown key ${JSON.stringify(key)}`);
    if (typeof text !== 'string') throw new Error(`feedback-kit: strings.${key} must be text`);
  }
  return {...STRINGS.en, ...own, ...strings};
}

// names in a sentence, joined as the language joins them: 'A, B, and C' in English, 'A, B a C' in Czech
export function listOf(items, language = 'en'){
  try { return new Intl.ListFormat(language || 'en', {type: 'conjunction'}).format(items); }
  catch { return items.join(', '); }
}
