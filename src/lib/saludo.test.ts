import { describe, it, expect } from 'vitest'
import { franjaHoraria, saludoHorario, nombreDeSaludo, saludoPersonal, HORA_TARDE, HORA_NOCHE } from './saludo'

const alas = (h: number) => new Date(2026, 8, 2, h, 30)

describe('franja horaria', () => {
  it('mañana hasta las 13, tarde hasta las 20, después noche', () => {
    expect(franjaHoraria(alas(0))).toBe('dias')
    expect(franjaHoraria(alas(HORA_TARDE - 1))).toBe('dias')
    expect(franjaHoraria(alas(HORA_TARDE))).toBe('tardes')
    expect(franjaHoraria(alas(HORA_NOCHE - 1))).toBe('tardes')
    expect(franjaHoraria(alas(HORA_NOCHE))).toBe('noches')
    expect(franjaHoraria(alas(23))).toBe('noches')
  })
  it('el texto arranca en mayúscula', () => {
    expect(saludoHorario(alas(9))).toBe('Buenos días')
    expect(saludoHorario(alas(15))).toBe('Buenas tardes')
    expect(saludoHorario(alas(21))).toBe('Buenas noches')
  })
})

describe('nombreDeSaludo', () => {
  it('toma el primer nombre de pila', () => {
    expect(nombreDeSaludo('Catalina Simes')).toBe('Catalina')
    expect(nombreDeSaludo('Brian Ridvanovich')).toBe('Brian')
  })
  it('de un email usa la parte de antes de la arroba', () => {
    expect(nombreDeSaludo('cata@mediterraneacarghas.com')).toBe('Cata')
    expect(nombreDeSaludo('joaquin.dornheim@mediterraneacarghas.com')).toBe('Joaquin')
    expect(nombreDeSaludo('bridvanovich@twf.uy')).toBe('Bridvanovich')
  })
  it('normaliza mayúsculas pero respeta los nombres que ya vienen bien', () => {
    expect(nombreDeSaludo('CATALINA')).toBe('Catalina')
    expect(nombreDeSaludo('agustina')).toBe('Agustina')
    expect(nombreDeSaludo('McCoy Jones')).toBe('McCoy')
  })
  it('a una empresa la saluda por su primera palabra', () => {
    expect(nombreDeSaludo('CHIAPERO Y ASOC. S.R.L.')).toBe('Chiapero')
    expect(nombreDeSaludo('VMG S.A.')).toBe('Vmg')
  })
  it('descarta iniciales sueltas y basura', () => {
    expect(nombreDeSaludo('J. Pablo Simes')).toBe('Pablo')
    expect(nombreDeSaludo('   ')).toBe('')
    expect(nombreDeSaludo(undefined)).toBe('')
    expect(nombreDeSaludo(null)).toBe('')
    expect(nombreDeSaludo('123')).toBe('')
  })
})

describe('saludoPersonal', () => {
  it('con nombre saluda por el nombre y la hora', () => {
    expect(saludoPersonal('Catalina Simes', alas(9))).toBe('Hola Catalina, buenos días')
    expect(saludoPersonal('cata@med.com', alas(15))).toBe('Hola Cata, buenas tardes')
    expect(saludoPersonal('Marcos', alas(22))).toBe('Hola Marcos, buenas noches')
  })
  it('sin nombre usable saluda igual, sin quedar colgado', () => {
    expect(saludoPersonal('', alas(9))).toBe('Buenos días')
    expect(saludoPersonal(undefined, alas(21))).toBe('Buenas noches')
  })
})
