// The interface wording for harnesses that run UI modules outside the browser: the resources
// straight from disk, and a classic-script prelude that defines t() and friends from them.
const fs = require('fs');
function textResources() {
  const index = JSON.parse(fs.readFileSync('ui/text/index.json', 'utf8')), resources = {};
  for (const [locale, names] of Object.entries(index.locales))
    for (const name of names)
      (resources[locale] ??= {})[name] =
          JSON.parse(fs.readFileSync(`ui/text/${locale}/${name}.json`, 'utf8'));
  return {index, resources};
}
function textPrelude() {
  const source = fs.readFileSync('ui/strings.js', 'utf8').replace(/\bexport\s+/g, ''),
        names = [...source.matchAll(/^(?:async )?function (\w+)/gm) ].map(m => m[1]),
        {index, resources} = textResources();
  return `if (!globalThis.useTexts) (() => {\n${source}\nuseTexts(${JSON.stringify(index)}, ${
      JSON.stringify(resources)});\nObject.assign(globalThis, {${names.join(', ')}});\n})();\n`;
}
module.exports = {
  textResources,
  textPrelude
};
