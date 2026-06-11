// Factories compartidas por los tests de analíticas. Vive fuera de *.test.ts
// para que importarla no re-registre suites ajenas.
import type { UnifiedOperation } from './operationsTypes'

export const op = (over: Partial<UnifiedOperation> = {}): UnifiedOperation =>
  ({
    uid: 'u1', ref: 'A1', mode: 'fcl', source: 'fcl', cliente: '', etd: '', eta: '',
    pais: 'UY', linea: '', terminal: '', n: 0, pkgs: 0, kg: 0, m3: 0,
    operativa: '', transporte: '', fiscal: '', tipo: '', status: '',
    ...over,
  }) as UnifiedOperation
