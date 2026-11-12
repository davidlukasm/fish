const port = (key, dir, node, fits = [], required = false) => ({key, dir, node, fits, required});
const unit = initial => ({least : 0, most : 1, initial, step : .01});
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
    key : 'spine',
    scope : 'side',
    slots : [
      port('urge', 'in', 'urge', [], true), port('steer', 'in', 'steer'),
      port('escape', 'in', 'escape'),
      port('stroke', 'out', [ 'oscillator', 'rest' ], [ 'muscle' ], true), port('fin', 'in', 'fin'),
      port('row', 'out', [ 'row', 'recoverOpponent' ], [ 'muscle' ]),
      port('recover', 'out', [ 'recover', 'rowOpponent' ], [ 'muscle' ])
    ],
    settings : {cycle : unit(.6), finCycle : unit(.6), alternation : unit(1)}
  },
  {
    key : 'olfaction',
    scope : 'side',
    slots : [
      port('scent', 'in', null, [ 'nose' ], true), port('target', 'out', 'gradient'),
      port('presence', 'out', 'concentration')
    ],
    settings : {contrast : unit(1), smoothing : unit(0)}
  },
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
      port('spermRelease', 'out', 'spermReady'), port('hatch', 'out', 'hatch')
    ],
    settings : {reserve : unit(1), rest : unit(1), maturity : {...unit(.5), least : .01}}
  },
  {
    key : 'choice',
    scope : 'side',
    slots : [
      port('target', 'in', 'target', [], true), port('strength', 'in', 'advance'),
      port('threat', 'in', 'threat'), port('pause', 'in', 'pause', [ 'gut', 'state' ], true),
      port('approach', 'out', 'target'), port('advance', 'out', 'advance'),
      port('avoid', 'out', 'threat'), port('search', 'out', 'search')
    ],
    settings : {searchTime : unit(.6), searchDrive : unit(1)}
  },
  {
    key : 'value',
    scope : 'side',
    slots : organ => [...Array.from({length : organ.region.features}, (_, i) => 'feature' + (i + 1))
                          .flatMap(node => [port(node, 'in', node), port(node, 'out', node)]),
                      port('reward', 'in', 'reward', [ 'gut', 'state' ], true),
                      port('harm', 'in', 'harm', [ 'pain' ])],
    settings : {
      features : {least : 1, most : 4, initial : 2, named : false},
      association : unit(1),
      teaching : unit(1)
    }
  }
].map(region =>
          Object.freeze({...region, category : 'regions', namedPorts : true, centers : [ home ]})));
