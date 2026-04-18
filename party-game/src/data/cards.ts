import { GameMode } from '../store'

export interface Card {
  text: string
  type: 'everyone' | 'player' | 'versus' | 'trivia' | 'challenge'
  spicy?: boolean // premium spicy version
}

// Helper: {PLAYER} gets replaced with a random player name at runtime
// {PLAYER2} gets replaced with a different random player

const noTeRiasCards: Card[] = [
  // FREE CARDS (first 15)
  { text: '¿Qué le dijo un semáforo a otro? No me mires, me estoy cambiando.', type: 'everyone' },
  { text: '¿Qué hace una abeja en el gimnasio? ¡Zumba!', type: 'everyone' },
  { text: '¿Cómo se despiden los químicos? Ácido un placer.', type: 'everyone' },
  { text: '¿Qué le dice un techo a otro techo? Techo de menos.', type: 'everyone' },
  { text: 'Mi perro se llama Pegamento. Ayer lo pisé y me quedé pegado.', type: 'everyone' },
  { text: '¿Qué hace un pez en el agua? Nada.', type: 'everyone' },
  { text: '¿Cómo se llama el campeón de buceo japonés? Tokofondo.', type: 'everyone' },
  { text: '¿Qué le dijo la cucharita al mate? ¡Me tenés re seca!', type: 'everyone' },
  { text: '¿Por qué el libro de matemáticas estaba triste? Porque tenía muchos problemas.', type: 'everyone' },
  { text: 'Le dije a mi vieja que me sentía frío. Me dijo: "Andá a un rincón que tiene 90 grados."', type: 'everyone' },
  { text: '¿Qué le dice un jaguar a otro? Jaguar you?', type: 'everyone' },
  { text: '¿Qué hace un perro con un taladro? Taladrando.', type: 'everyone' },
  { text: 'Doctor, me siento como una baraja. Espere, que lo atiendo enseguida.', type: 'everyone' },
  { text: '¿Sabés qué es lo peor de los chistes de desempleados? Que no funcionan.', type: 'everyone' },
  { text: '¿Cómo se dice pañuelo en japonés? Sakamoko.', type: 'everyone' },
  // PREMIUM CARDS
  { text: '{PLAYER} tiene que contar el chiste más malo que sepa. Si ALGUIEN se ríe, beben los dos.', type: 'player', spicy: true },
  { text: 'Todos miren a {PLAYER} por 10 segundos sin parpadear. El primero que se ría, bebe doble.', type: 'player', spicy: true },
  { text: '¿Cómo organizan una fiesta los planetas? Pla-nean.', type: 'everyone', spicy: true },
  { text: '{PLAYER} tiene que decir "boludo" de 5 formas distintas sin reírse.', type: 'player', spicy: true },
  { text: 'Mi novia me dejó por mi obsesión con el mate. Le dije: "cebame esta".', type: 'everyone', spicy: true },
  { text: '¿Qué le dice un huevo a una sartén? Me tenés frito.', type: 'everyone', spicy: true },
  { text: '{PLAYER}, hacé tu mejor cara de WhatsApp 😏 sin reírte. Si te reís: 2 tragos.', type: 'player', spicy: true },
  { text: 'Fui a comprar camuflaje pero no encontré nada.', type: 'everyone', spicy: true },
  { text: '¿Qué le dijo el wifi al router? Tenemos una conexión especial.', type: 'everyone', spicy: true },
  { text: '{PLAYER}: contá hasta 10 pero reemplazá cada número par por "culpa del gobierno". Sin reírte.', type: 'player', spicy: true },
  { text: 'Mi abuelo murió haciendo lo que más le gustaba: gritarle a la tele.', type: 'everyone', spicy: true },
  { text: '¿Cómo se dice 99 en chino? Cachi cien.', type: 'everyone', spicy: true },
  { text: '{PLAYER} y {PLAYER2}: mírense a los ojos y digan "te amo" 3 veces. El primero que se ría, bebe.', type: 'versus', spicy: true },
  { text: 'Mi terapeuta me dijo que escriba cartas a quienes odio y las queme. Ya lo hice pero ahora no sé qué hacer con las cartas.', type: 'everyone', spicy: true },
  { text: 'Todos: intenten decir "Me gusta la banana" con cara seria mirando a {PLAYER}. El primero que se ríe: bebe.', type: 'player', spicy: true },
]

const yoNuncaCards: Card[] = [
  // FREE
  { text: 'Yo nunca mandé un mensaje al grupo equivocado', type: 'everyone' },
  { text: 'Yo nunca stalkeé el Instagram de un/a ex', type: 'everyone' },
  { text: 'Yo nunca fingí que se me cortaba una llamada', type: 'everyone' },
  { text: 'Yo nunca llegué a una fiesta sin ser invitado/a', type: 'everyone' },
  { text: 'Yo nunca dije "ya salgo" estando todavía en la cama', type: 'everyone' },
  { text: 'Yo nunca googlee mi propio nombre', type: 'everyone' },
  { text: 'Yo nunca me hice el/la dormido/a para no ayudar', type: 'everyone' },
  { text: 'Yo nunca me comí algo del piso', type: 'everyone' },
  { text: 'Yo nunca mentí en un CV', type: 'everyone' },
  { text: 'Yo nunca me fui de un boliche/bar sin pagar', type: 'everyone' },
  { text: 'Yo nunca hablé solo/a en voz alta', type: 'everyone' },
  { text: 'Yo nunca tomé mate lavado por no ser maleducado/a', type: 'everyone' },
  { text: 'Yo nunca olvidé el cumpleaños de alguien importante', type: 'everyone' },
  { text: 'Yo nunca canté en la ducha', type: 'everyone' },
  { text: 'Yo nunca me reí en un momento totalmente inapropiado', type: 'everyone' },
  // PREMIUM
  { text: 'Yo nunca besé a alguien que está en esta sala', type: 'everyone', spicy: true },
  { text: 'Yo nunca mandé un nude', type: 'everyone', spicy: true },
  { text: 'Yo nunca le tiré onda al/la mejor amigo/a de mi ex', type: 'everyone', spicy: true },
  { text: 'Yo nunca me escapé de mi casa de noche', type: 'everyone', spicy: true },
  { text: 'Yo nunca lloré por alguien que no lo merecía', type: 'everyone', spicy: true },
  { text: 'Yo nunca hice algo ilegal en otro país', type: 'everyone', spicy: true },
  { text: 'Yo nunca me arrepentí de algo que hice anoche', type: 'everyone', spicy: true },
  { text: 'Yo nunca stalkeé el celular de mi pareja', type: 'everyone', spicy: true },
  { text: 'Yo nunca fui infiel (ojo que todos están mirando...)', type: 'everyone', spicy: true },
  { text: 'Yo nunca me enamoré de alguien prohibido/a', type: 'everyone', spicy: true },
  { text: 'Yo nunca hice un plan y cancele inventando una excusa', type: 'everyone', spicy: true },
  { text: 'Yo nunca mentí sobre mi edad', type: 'everyone', spicy: true },
  { text: 'Yo nunca fui a un after y terminé en otro barrio', type: 'everyone', spicy: true },
  { text: 'Yo nunca bloqueé y desbloqueé a alguien el mismo día', type: 'everyone', spicy: true },
  { text: 'Yo nunca me hice amigo/a de alguien solo por conveniencia', type: 'everyone', spicy: true },
]

const quienEsMasCards: Card[] = [
  { text: '¿Quién es más probable que se duerma en cualquier lado?', type: 'everyone' },
  { text: '¿Quién es más probable que aparezca en un reality show?', type: 'everyone' },
  { text: '¿Quién es más probable que se mude a otro país?', type: 'everyone' },
  { text: '¿Quién es más probable que se vuelva millonario/a?', type: 'everyone' },
  { text: '¿Quién es más probable que termine preso/a?', type: 'everyone' },
  { text: '¿Quién es más probable que se case primero?', type: 'everyone' },
  { text: '¿Quién es más probable que sobreviva a un apocalipsis zombie?', type: 'everyone' },
  { text: '¿Quién es más probable que se haga famoso/a en TikTok?', type: 'everyone' },
  { text: '¿Quién es más probable que pierda el celular esta noche?', type: 'everyone' },
  { text: '¿Quién es más probable que termine llorando hoy?', type: 'everyone' },
  // PREMIUM
  { text: '¿Quién es más probable que tenga un OnlyFans secreto?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que mienta sobre con cuánta gente estuvo?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que se chapé a alguien esta noche?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que termine vomitando?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que se mande un mensaje arrepintiéndose mañana?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que stalkee a su ex después de esta fiesta?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que aparezca en un video vergonzoso mañana?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que duerma en un lugar random esta noche?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que haya ghosteado a alguien esta semana?', type: 'everyone', spicy: true },
  { text: '¿Quién es más probable que tenga un crush secreto por alguien de este grupo?', type: 'everyone', spicy: true },
]

const verdadOShotCards: Card[] = [
  { text: '{PLAYER}: ¿Cuál es la mentira más grande que le dijiste a tus viejos?', type: 'player' },
  { text: '{PLAYER}: ¿Cuál es tu mayor red flag?', type: 'player' },
  { text: '{PLAYER}: ¿Quién de acá te parece más atractivo/a?', type: 'player' },
  { text: '{PLAYER}: Mostrá el último mensaje de WhatsApp que mandaste... o shot.', type: 'player' },
  { text: '{PLAYER}: ¿Cuál fue tu momento más vergonzoso en una fiesta?', type: 'player' },
  { text: '{PLAYER}: ¿A quién de los presentes le darías un beso?', type: 'player' },
  { text: '{PLAYER}: ¿Cuál es el secreto más grande que guardás?', type: 'player' },
  { text: '{PLAYER}: ¿Alguna vez copiaste en un examen? Contá.', type: 'player' },
  { text: '{PLAYER}: ¿Cuál fue la peor cita que tuviste?', type: 'player' },
  { text: '{PLAYER}: Si pudieras borrar a alguien de esta sala de tu vida, ¿a quién?', type: 'player' },
  // PREMIUM
  { text: '{PLAYER}: Mostrá la última foto de tu galería... o 2 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: ¿Con quién de acá tendrías un one night stand?', type: 'player', spicy: true },
  { text: '{PLAYER}: Lee en voz alta tu último chat de Instagram DM... o 3 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: ¿Cuál es tu fantasía más rara?', type: 'player', spicy: true },
  { text: '{PLAYER}: ¿Alguna vez te enganchaste con alguien de tu laburo/facultad? Contá.', type: 'player', spicy: true },
  { text: '{PLAYER}: Confesá algo que nadie de acá sepa sobre vos... o 2 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: ¿Cuál fue la cosa más turbia que hiciste estando en pedo?', type: 'player', spicy: true },
  { text: '{PLAYER}: Llamá a la última persona que te mandó mensaje y decile que la extrañás... o 3 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: ¿A quién le mandaste un "te extraño" borracho/a?', type: 'player', spicy: true },
  { text: '{PLAYER}: ¿Qué es lo más lejos que llegaste en una primera cita?', type: 'player', spicy: true },
]

const retosViralesCards: Card[] = [
  { text: '{PLAYER}: Hacé tu mejor TikTok dance por 15 segundos... o bebé.', type: 'player' },
  { text: '{PLAYER}: Mandá un audio de WhatsApp a tu crush diciendo algo random... o 2 shots.', type: 'player' },
  { text: '{PLAYER}: Imitá a {PLAYER2} por 30 segundos. El grupo juzga.', type: 'versus' },
  { text: '{PLAYER}: Hacé 10 flexiones ahora mismo. Si no podés, bebé.', type: 'player' },
  { text: '{PLAYER}: Publicá una selfie ahora con caption "Soltero/a y disponible"... o 3 shots.', type: 'player' },
  { text: '{PLAYER}: Cantá el estribillo de la última canción que escuchaste. Sin celular.', type: 'player' },
  { text: '{PLAYER}: Intercambiá una prenda con {PLAYER2} por las próximas 3 rondas.', type: 'versus' },
  { text: '{PLAYER}: Poné tu celular en modo avión por 10 minutos... o 2 shots.', type: 'player' },
  { text: '{PLAYER}: Dejá que el grupo publique una historia de Instagram desde tu cuenta... o 3 shots.', type: 'player' },
  { text: '{PLAYER}: Hacé el "Waka Waka" de Shakira completo... o bebé.', type: 'player' },
  // PREMIUM
  { text: '{PLAYER}: Llamá a tu ex y preguntale si quiere volver... o 3 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: Dejá que {PLAYER2} escriba un tweet/post desde tu cuenta.', type: 'versus', spicy: true },
  { text: '{PLAYER}: Hacé el "rizz challenge" con {PLAYER2}. El grupo vota quién gana.', type: 'versus', spicy: true },
  { text: '{PLAYER}: Mandá "Necesitamos hablar" a la última persona que te escribió... y esperá su respuesta.', type: 'player', spicy: true },
  { text: '{PLAYER}: Bailá un reggaetón con {PLAYER2} por 20 segundos. Sin reírse.', type: 'versus', spicy: true },
  { text: 'TODOS: El último que se saque los zapatos bebe doble.', type: 'everyone', spicy: true },
  { text: '{PLAYER}: Mostrá tu Screen Time del celular... o 2 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: Hacé un unboxing de tu billetera/cartera. Explicá cada cosa.', type: 'player', spicy: true },
  { text: '{PLAYER}: Grabá un video diciendo 3 cosas que te gustan de {PLAYER2}. Se sube a historias.', type: 'versus', spicy: true },
  { text: '{PLAYER}: El grupo elige una persona de tus contactos. Tenés que llamarla y cantar cumpleaños feliz.', type: 'player', spicy: true },
]

const pickleballCards: Card[] = [
  // TRIVIA - el que no sabe, bebe
  { text: '¿Cuánto mide la "kitchen" o zona de no-volea en pickleball? (7 pies / 2.13m) El que no sepa... ¡bebe!', type: 'trivia' },
  { text: '¿De qué material es originalmente la pelota de pickleball? (Plástico con agujeros) ¡El que no sepa, bebe!', type: 'trivia' },
  { text: '¿En qué año se inventó el pickleball? (1965) ¿Sabías o tomás?', type: 'trivia' },
  { text: '¿Cómo se llama el golpe que se hace justo después del bote cerca de la red? (Dink) Si no sabés... shot.', type: 'trivia' },
  { text: '¿Hasta qué número se juega normalmente un partido de pickleball? (11 puntos) El que falle, bebe.', type: 'trivia' },
  { text: '¿Qué es la "regla de los dos botes" en pickleball? El que mejor la explique se salva. Los demás beben.', type: 'trivia' },
  { text: '¿Cómo se llama el saque en pickleball? ¿Por arriba o por abajo? (Por abajo) El que diga mal... shot.', type: 'trivia' },
  { text: '¿Por cuántos puntos tenés que ganar en pickleball? (2 puntos de diferencia) ¿Sabías?', type: 'trivia' },
  { text: '¿Cuántos jugadores hay en una cancha de pickleball en dobles? (4) Fácil... pero el que dude, bebe.', type: 'trivia' },
  { text: '¿De dónde viene el nombre "pickleball"? (Del perro Pickles de los creadores) Si no sabés, tomá.', type: 'trivia' },
  // CHALLENGES
  { text: '{PLAYER}: Hacé el movimiento del "dink" perfecto con una cuchara y un vaso. El grupo juzga.', type: 'challenge' },
  { text: '{PLAYER}: Nombrá 3 golpes de pickleball en 10 segundos. Si no podés... bebé doble.', type: 'challenge' },
  { text: '{PLAYER} vs {PLAYER2}: ¿Quién tiene mejor forma de saque? Demostren sin paleta. El grupo vota.', type: 'versus' },
  { text: '{PLAYER}: ¿Qué es un "Erne" en pickleball? Si la pegás, todos beben. Si no, bebés vos.', type: 'trivia' },
  { text: '{PLAYER}: Actuá como si estuvieras en la final de un torneo de pickleball. Narrá tu mejor punto.', type: 'challenge' },
  // PREMIUM
  { text: '{PLAYER}: Si pudieras jugar pickleball con cualquier famoso, ¿con quién? El grupo vota si es buena elección.', type: 'player', spicy: true },
  { text: '¿Qué es un "third shot drop" en pickleball? Si alguien lo sabe, el resto bebe. Si nadie sabe, todos beben.', type: 'trivia', spicy: true },
  { text: '{PLAYER}: Convencé a {PLAYER2} de que el pickleball es mejor que el pádel en 20 segundos. El grupo juzga.', type: 'versus', spicy: true },
  { text: '{PLAYER}: Imitá a un tenista famoso jugando pickleball por primera vez. El grupo juzga.', type: 'challenge', spicy: true },
  { text: '¿Cuál es la diferencia entre la pelota de indoor y outdoor en pickleball? Si nadie sabe... todos beben doble.', type: 'trivia', spicy: true },
  { text: '{PLAYER}: ¿Pádel, tenis o pickleball? Defendé tu posición. Si el grupo no te cree... 2 shots.', type: 'player', spicy: true },
  { text: '{PLAYER}: Hacé un "rally" imaginario con {PLAYER2} usando las manos. 10 golpes sin parar. Si fallan, beben.', type: 'versus', spicy: true },
  { text: '{PLAYER}: Nombrá 5 reglas de pickleball en 15 segundos. Cada una que falte = 1 trago.', type: 'challenge', spicy: true },
  { text: '¿Cuánto mide la red de pickleball en el centro? (34 pulgadas / 86cm) Esta es difícil... bebe el que falle.', type: 'trivia', spicy: true },
  { text: 'TODOS: Hagan un torneo de "air pickleball" en parejas. Los perdedores beben.', type: 'everyone', spicy: true },
]

export const CARDS: Record<string, Card[]> = {
  'no-te-rias': noTeRiasCards,
  'yo-nunca': yoNuncaCards,
  'quien-es-mas': quienEsMasCards,
  'verdad-o-shot': verdadOShotCards,
  'retos-virales': retosViralesCards,
  'pickleball': pickleballCards,
}

export function getCardsForMode(mode: string, isPremium: boolean): Card[] {
  const allCards = CARDS[mode] || []
  if (isPremium) return allCards
  return allCards.filter((c) => !c.spicy)
}

export function fillPlayerNames(text: string, players: string[]): string {
  let result = text
  if (players.length > 0) {
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    result = result.replace('{PLAYER}', shuffled[0] || 'Alguien')
    result = result.replace('{PLAYER2}', shuffled[1] || shuffled[0] || 'Otro')
  }
  return result
}
