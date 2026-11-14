import {preferredScent} from '../../tuning.js';
import {scentNames} from '../../brain_model.js';
import {organTypes} from '../model/document.js';
import {t} from '../../strings.js';

export function profileNames(organ) {
  const best = organTypes(organ).map(type => preferredScent(type.centers[0]));
  return best.map((k, i) => best.indexOf(k) === best.lastIndexOf(k)
                                ? scentNames?.[k] ?? ''
                                : t('units.numbered', {
                                    name : scentNames?.[k] ?? '',
                                    n : best.slice(0, i + 1).filter(b => b === k).length
                                  }));
}
