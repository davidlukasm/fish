// Wording is data: every key the code and the markup ask for exists, every thought rule parses,
// every wording resolves all its placeholders, and the engine never leaks raw templates.
const fs = require('fs'), assert = require('assert');
const asModule = source => 'data:text/javascript,' + encodeURIComponent(source);
(async () => {
  const units = asModule(fs.readFileSync('ui/units.js', 'utf8')),
        schema = asModule(fs.readFileSync('ui/schema.js', 'utf8')),
        strings = asModule(fs.readFileSync('ui/strings.js', 'utf8')
                               .replace("'./units.js'", JSON.stringify(units))
                               .replace("'./schema.js'", JSON.stringify(schema))),
        {format, evaluate} = await import(strings),
        {think, moodOf, source} =
            await import(asModule(fs.readFileSync('ui/thoughts.js', 'utf8')
                                      .replace("'./strings.js'", JSON.stringify(strings))
                                      .replace("'./units.js'", JSON.stringify(units))));
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
  // Every literal key the code names exists in the default language: a wording for t(), a list
  // for tList(), and any other 'area.key' literal (keys chosen by a condition) as either.
  const lookup = key => key.split('.').reduce((node, part) => node?.[part], texts[index.default]);
  const areas = Object.keys(texts[index.default]).join('|');
  for (const file of fs.readdirSync('ui').filter(n => n.endsWith('.js'))) {
    const source = fs.readFileSync('ui/' + file, 'utf8');
    for (const [, fn, key] of source.matchAll(/\b(t|tList)\('([\w.]+)'\s*[,)]/g))
      assert.ok(fn === 't' ? typeof lookup(key) === 'string' : Array.isArray(lookup(key)),
                file + ': missing text ' + key);
    for (const [, key] of source.matchAll(new RegExp(`'((?:${areas})\\.[\\w.]*\\w)'`, 'g')))
      assert.ok(lookup(key) !== undefined, file + ': missing text ' + key);
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

  // Random situations: every thought that comes out is fully worded, one sentence, and no
  // wording comes back while it is still among the recent ones.
  const sides = [ 'left', 'right', 'front' ], organs = Object.keys(T.lexicon.accusative),
        keys = Object.keys(T.lexicon.intent), lessons = Object.keys(T.lexicon.learned),
        surprises = Object.keys(T.lexicon.surprise),
        names = new Set([
          ...T.rules.flatMap(r => [r.when, String(r.salience)]), ...T.moods.map(m => m.when || '')
        ].flatMap(e => e.match(/[A-Za-z_]\w*/g) || [])
                            .filter(
                                n => !['clamp', 'max', 'min', 'abs', 'true', 'false'].includes(n)));
  const any = list => list[Math.floor(Math.random() * list.length)];
  const random = () => {
    const f = {};
    for (const name of names)
      f[name] = name.endsWith('_rise')   ? (Math.random() - .3) * .4
                : name.startsWith('has') ? Number(Math.random() < .8)
                                         : Math.random();
    const key = any(keys);
    Object.assign(f, {
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
      pokeStation : any(organs),
      eyeSide : any(sides),
      nearSide : any(sides),
      latSide : any(sides),
      scentSide : any(sides),
      eyeDark : Math.round(Math.random()),
      scentIndex : Math.floor(Math.random() * 8),
      scentBand : Math.floor(Math.random() * 3),
      intentKey : key,
      intentOrgan : key.split('>').pop(),
      feelIndex : Math.floor(Math.random() * T.lexicon.feel.length),
      feelSign : Math.random() < .5 ? 'up' : 'down',
      lessonKey : any(lessons),
      surpriseSense : any(surprises),
      moodChanged : Math.round(Math.random()),
      quiet : 30
    });
    f.eyeTone = f.eyeDark ? 'dark' : 'bright';
    f.intentSign = Math.random() < .5 ? 'drive' : 'hold';
    f.mood = moodOf(T, f).name;
    return f;
  };
  const oneSentence = text => !/[.!?\u2026]\s+\S/.test(text);
  const mind = {slow : {}, peak : {}, last : {}, used : {}, recent : [], topics : [], prev : {}},
        said = [], topics = new Set();
  let now = 0;
  for (let i = 0; i < 6000; i++) {
    now += 4000;
    const thought = think(T, random(), mind, now);
    if (!thought)
      continue;
    assert(!/[{}]/.test(thought.text), 'unresolved placeholder: ' + thought.text);
    assert(thought.text.trim().length > 1);
    assert(oneSentence(thought.text), 'more than one sentence: ' + thought.text);
    assert(!thought.brief || oneSentence(thought.brief),
           'more than one sentence: ' + thought.brief);
    assert(!said.slice(0, T.compose.remember).includes(thought.text), 'repeated: ' + thought.text);
    said.unshift(thought.text);
    topics.add(mind.topics[0]);
  }
  assert(said.length > 2000, 'the engine speaks');
  assert(topics.size > T.rules.length / 2, 'many topics come up: ' + topics.size);
  // Every wording in the pools is one sentence.
  const pools = node => typeof node === 'string' ? [ node ]
                        : Array.isArray(node)    ? node.flatMap(pools)
                                                 : Object.values(node || {}).flatMap(pools);
  for (const area of ['say', 'brief', 'intent', 'learned', 'surprise'])
    for (const text of pools(T.lexicon[area]))
      assert(oneSentence(text), 'more than one sentence: ' + text);
  // Every rule can produce wording somewhere; a combined rule covers known topics.
  const known = new Set(T.rules.map(r => r.topic));
  for (const r of T.rules) {
    const f = random();
    assert(source(T, r.texts, {...f, mood : 'gemütlich'}).length || r.topic.startsWith('intent'),
           'rule without wording: ' + r.topic);
    for (const c of r.covers || [])
      assert(known.has(c), r.topic + ' covers an unknown topic: ' + c);
  }
  console.log(
      'Texte: Schlüssel, Gedankenregeln (ein Satz je Gedanke), Wortschatz und Satzbau als Daten: OK');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
