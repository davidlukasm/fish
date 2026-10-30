// Wording is data: every key the code and the markup ask for exists, every thought rule parses,
// every wording resolves all its placeholders, and the engine never leaks raw templates.
const fs = require('fs'), assert = require('assert');
const asModule = source => 'data:text/javascript,' + encodeURIComponent(source);
(async () => {
  const strings = asModule(fs.readFileSync('ui/strings.js', 'utf8')),
        {format, evaluate} = await import(strings),
        {think, moodOf, source} =
            await import(asModule(fs.readFileSync('ui/thoughts.js', 'utf8')
                                      .replace("'./strings.js'", JSON.stringify(strings))));
  assert.equal(format('{Side} und {side}', {side : 'links'}), 'Links und links');
  assert.equal(evaluate('hunger > 0.5 && !(pain >= 1) || max(a, 2) == 3', {hunger : .6}), true);
  assert.equal(evaluate('missing + 1', {}), 1);
  assert.throws(() => evaluate('hunger >', {}));

  const T = JSON.parse(fs.readFileSync('ui/text/de-AT/thoughts.json', 'utf8')),
        index = JSON.parse(fs.readFileSync('ui/text/index.json', 'utf8')), texts = {};
  for (const [locale, names] of Object.entries(index.locales))
    for (const name of names)
      (texts[locale] ??= {})[name] =
          JSON.parse(fs.readFileSync(`ui/text/${locale}/${name}.json`, 'utf8'));
  // Every literal key the code asks t() for exists in the default language.
  for (const file of fs.readdirSync('ui').filter(n => n.endsWith('.js')))
    for (const [, key] of fs.readFileSync('ui/' + file, 'utf8')
             .matchAll(/\bt\('([\w.]+)'\s*[,)]/g)) {
      let node = texts[index.default];
      for (const part of key.split('.'))
        node = node?.[part];
      assert.equal(typeof node, 'string', file + ': missing text ' + key);
    }
  // Every data-t key in the markup exists too.
  for (const [, key] of fs.readFileSync('viewer.html', 'utf8')
           .matchAll(/data-t(?:-[\w-]+)?="([\w.]+)"/g)) {
    let node = texts[index.default];
    for (const part of key.split('.'))
      node = node?.[part];
    assert.equal(typeof node, 'string', 'viewer.html: missing text ' + key);
  }
  for (const r of T.rules) {
    evaluate(r.when, {});
    evaluate(r.salience, {});
  }
  for (const m of T.moods)
    if (m.when)
      evaluate(m.when, {});

  // Random situations: every thought that comes out is fully worded.
  const sides = [ 'left', 'right', 'front' ], organs = Object.keys(T.lexicon.accusative),
        keys = Object.keys(T.lexicon.intent);
  const random = () => {
    const f = {};
    for (const name of ['hunger', 'fullness', 'pain', 'health', 'aggression', 'defense', 'ready',
                        'eggReady', 'spermReady', 'excite', 'eating', 'contact', 'bladder', 'touch',
                        'pigment', 'stir', 'feelShift', 'eyeNews', 'latNews', 'scentNews',
                        'intentNews', 'surpriseNews', 'learned', 'thrust', 'turn'])
      for (const suffix of ['', '_rise', '_norm', '_prev', '_prevNorm'])
        f[name + suffix] = Math.random() * (suffix === '_rise' ? .3 : 1);
    const key = keys[Math.floor(Math.random() * keys.length)];
    Object.assign(f, {
      hasEyes : 1,
      hasNose : 1,
      hasLateral : 1,
      hasBladder : 1,
      hasPigment : 1,
      pumping : 1,
      eggLaying : 1,
      eggLaying_prev : 0,
      probe : 1,
      probe_prev : 0,
      probeKind : Math.floor(Math.random() * 3),
      probeColour : Math.floor(Math.random() * 12),
      probeScent : Math.floor(Math.random() * 8),
      poked : 1,
      dice : 0,
      pokedOrgan : Math.round(Math.random()),
      pokeStation : organs[Math.floor(Math.random() * organs.length)],
      eyeSide : sides[Math.floor(Math.random() * 3)],
      latSide : sides[Math.floor(Math.random() * 3)],
      scentSide : sides[Math.floor(Math.random() * 3)],
      eyeTone : Math.random() < .5 ? 'bright' : 'dark',
      scentIndex : Math.floor(Math.random() * 8),
      scentBand : Math.floor(Math.random() * 3),
      intentKey : key,
      intentOrgan : key.split('>').pop(),
      intentSign : Math.random() < .5 ? 'drive' : 'hold',
      feelIndex : Math.floor(Math.random() * 6),
      feelSign : Math.random() < .5 ? 'up' : 'down',
      lessonKey : '',
      surpriseSense : 'nose',
      quiet : 30
    });
    f.mood = moodOf(T, f).name;
    return f;
  };
  const mind = {slow : {}, peak : {}, last : {}, used : {}, recent : [], topics : [], prev : {}};
  let now = 0, said = 0;
  for (let i = 0; i < 3000; i++) {
    now += 4000;
    const thought = think(T, random(), mind, now);
    if (!thought)
      continue;
    said++;
    assert(!/[{}]/.test(thought.text), 'unresolved placeholder: ' + thought.text);
    assert(thought.text.trim().length > 1);
  }
  assert(said > 1000, 'the engine speaks');
  // Every rule can produce wording somewhere.
  for (const r of T.rules) {
    const f = random();
    assert(source(T, r.texts, {...f, mood : 'gemütlich'}).length || r.topic.startsWith('intent'),
           'rule without wording: ' + r.topic);
  }
  console.log('Texte: Schlüssel, Gedankenregeln, Wortschatz und Satzbau als Daten: OK');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
