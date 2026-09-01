// ── Whitelist de columnas de `shipments` que acepta el PATCH/POST ──────────
//
// Vive en un módulo propio (y no adentro de api/data/[entity].ts) para que el
// frontend pueda TESTEAR contra la misma lista: cada dato clave de una
// modalidad (src/lib/datosClave.ts) tiene que estar acá, si no el PATCH lo
// descarta en silencio y el operativo cree que guardó algo que no se guardó.
//
// Sin imports: lo compilan tanto Vercel (NodeNext) como Vite/vitest (bundler).

export const SHIPMENT_COLS_LIST: readonly string[] = [
  'ref','client_ref','mode','agente','cliente','shipper','incoterm','pkgs','kg','m3',
  'doc_number','hbl','origin','origin_country','etd','eta','seguimiento','contenedor','buque','linea','transbordo',
  'seguro','certi','telex','impresa','despacho','deposito','fecha_consol','transporte','camion','dev_fecha',
  'dest_country','discharge_port','dest_port','fiscal','wood','no_apilable','oog','imo','tipo','ftl_ltl','costo_extra','observacion','status',
  'operator_id','notes','archived','source','desconsol_date','entrega_planta',
  'libre','salida','eta_fiscal','operativa','descarga','dev','terminal','n_cntr','origin_ref',
  // LCL: stock del depósito (su fecha es desconsol_date, porque desconsolidar
  // ES entregar el stock) + marca del cliente (stand_by = no la saques todavía ·
  // prioridad = sacala ya) con su motivo.
  'stock','marca_cliente','marca_motivo',
  // Pagos: monto_* = ESTIMADO por rubro (null=sin datos · >0=previsto · 0=pagado
  // solo como convención legacy de la SG) + forma de pago override + fecha de
  // pago + pago_*_monto = lo que FINALMENTE se pagó (Brian 26/08). Los
  // pago_*_by NO están acá a propósito: los estampa el server desde el token
  // (el cliente no puede falsificar quién pagó).
  'monto_flete','monto_locales','monto_terminal','monto_devolucion','forma_pago',
  'pago_flete_at','pago_locales_at','pago_terminal_at','pago_devolucion_at',
  'pago_flete_monto','pago_locales_monto','pago_terminal_monto','pago_devolucion_monto',
  'operativas',
]

export const SHIPMENT_COLS: ReadonlySet<string> = new Set(SHIPMENT_COLS_LIST)
