// Atelier ansehen wie Claude: Betrachter vorher selbst starten (Oberfläche wird beim Start geladen,
// nach jedem Pull neu starten, mit frischem Datenordner):
//   cd <produkt> && python3 -B viewer.py --port 8765 --no-browser --empty-world --fresh \
//      --fish 4 --food 20 --threads 2 --data-dir /tmp/viewdataNN
// Dann: node atelier_beispiel.js [Organ] [x] [y]   (Bilder in ./bilder_atelier/)
// Hinweise: Ein Klick auf den Fisch mit gewähltem Bibliothekseintrag SETZT ein neues Organ.
// Vorhandenes Organ wählen: erst auf leere Fläche klicken (300,880), dann auf seine Trefferfläche
// ([data-organ].aid-organ-hit). Der Betrachter merkt sich den Fisch über Seitenaufrufe hinweg.
// Übliche Stellen (Fenster 1440×960): Auge 470,500 · Nase 420,540 · Kiefer (Muskel) 375,540 ·
// Öffner (Muskel) 600,515 · Brustflosse (Muskel) 680,610 · Schwanz (Muskel) 960,540 ·
// Kiemen 520,520 · Darm 800,580 · Farbzellen 560,520 · Seitenlinie 560,520.
const {chromium} = require('playwright');
const fs = require('fs');
const [name = 'Kiemen', x = 520, y = 520] = process.argv.slice(2);
(async () => {
  fs.mkdirSync('bilder_atelier', {recursive: true});
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 1440, height: 960}, deviceScaleFactor: 1});
  const errs = [];
  p.on('pageerror', e => errs.push('PAGE ' + e.stack.slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://127.0.0.1:8765/'); await p.waitForTimeout(2500);
  await p.getByText('Zum Fischbau').first().click(); await p.waitForTimeout(3000);
  // Bibliotheksknöpfe haben weiche Trennstriche (­) im Namen.
  await p.getByRole('button', {name: new RegExp('^' + name.replace(/(.)/g, '$1\\u00ad?') + '$')})
      .first().click();
  await p.waitForTimeout(400);
  await p.mouse.click(Number(x), Number(y)); await p.waitForTimeout(4500);
  await p.screenshot({path: 'bilder_atelier/ganz.png'});
  // Inspektor in voller Länge: Fenster hoch stellen, Ausschnitt rechts.
  await p.setViewportSize({width: 1440, height: 2600}); await p.waitForTimeout(1500);
  await p.screenshot({path: 'bilder_atelier/inspektor.png', clip: {x: 1122, y: 100, width: 318, height: 2400}});
  await p.setViewportSize({width: 1440, height: 960}); await p.waitForTimeout(800);
  // Ziehen: mouse.move/down, mehrere move in kleinen Schritten mit kurzer Pause, dann up.
  console.log('Fehler', errs);
  await b.close();
})();
