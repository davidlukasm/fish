const port = (key, dir, node, fits = [], required = false) => ({key, dir, node, fits, required});
const home = Object.freeze({
  key : 'relay',
  role : 'nerve',
  functionCode : -1,
  copies : 4,
  surface : 'inner',
  zones : [ 1, 2, 3 ],
  sign : 1,
  mode : 1,
  pace : -1,
  modulator : -1
});

export const REGION_TYPES = Object.freeze([
  {
    key : 'state',
    scope : 'single',
    slots : [
      port('intake', 'in', 'intake', [ 'gut' ], true), port('fullness', 'in', 'satiety', [ 'gut' ]),
      port('reserve', 'in', 'reserve', [ 'blood' ], true),
      port('eggFullness', 'in', 'eggReady', [ 'eggs' ]),
      port('spermFullness', 'in', 'spermReady', [ 'sperm' ]), port('intake', 'out', 'intake'),
      port('satiety', 'out', 'satiety'), port('pause', 'out', 'pause'),
      port('investment', 'out', 'investment'), port('lay', 'out', 'eggReady'),
      port('spermRelease', 'out', 'spermReady')
    ],
    settings : {}
  },
  {
    key : 'choice',
    scope : 'side',
    slots : [
      port('target', 'in', 'target', [], true), port('threat', 'in', 'threat'),
      port('pause', 'in', 'pause', [ 'state' ]), port('approach', 'out', 'target'),
      port('avoid', 'out', 'threat'), port('search', 'out', 'search')
    ],
    settings : {}
  },
  {
    key : 'value',
    scope : 'side',
    slots : organ => [...Array.from({length : organ.region.features}, (_, i) => 'feature' + (i + 1))
                          .flatMap(node => [port(node, 'in', node), port(node, 'out', node)]),
                      port('reward', 'in', 'reward', [ 'gut', 'state' ], true),
                      port('harm', 'in', 'harm', [ 'pain' ])],
    settings : {features : {least : 1, most : 4, initial : 2, named : false}}
  }
].map(region =>
          Object.freeze({...region, category : 'regions', namedPorts : true, centers : [ home ]})));
