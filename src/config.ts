/**
 * FRAME IT — unico file di configurazione.
 * Tutti i numeri "da regolare" stanno qui. Unità: metri, secondi, gradi.
 * BASE = calcio. Ogni altro sport cambia solo i numeri che elenca in SPORTS (in fondo al file).
 */
const BASE = {
  render: {
    /** Limite al devicePixelRatio: 1.5 = buon compromesso nitidezza / 60 fps sui telefoni medi. */
    maxPixelRatio: 1.5,
    antialias: true,
  },

  pitch: {
    /** Calcio a 7 amatoriale. */
    length: 60,
    width: 40,
    goalWidth: 6,
    goalHeight: 2.2,
    /** Come si chiama la porta nelle motivazioni del voto ("Porta fuori inquadratura"). */
    goalName: 'Porta',
    /** Solo basket: distanza del ferro dalla linea di fondo, altezza del ferro, raggio del tiro da tre. */
    hoopFromBaseline: 1.575,
    rimHeight: 3.05,
    threePoint: 6.75,
  },

  camera: {
    /** Posizione fissa: bordo campo, all'altezza della metà campo, su una pedana. */
    position: { x: 0, y: 5, z: 27 },
    startYaw: 0,
    startPitch: -9,
    startFov: 34,
    /** FOV verticale in gradi: più basso = più zoom. */
    fovMin: 5,
    fovMax: 50,
    /** Rotazione massima a destra/sinistra e su/giù. */
    yawLimit: 80,
    pitchMin: -40,
    pitchMax: 45,
    /** 1 = trascinare per tutta l'altezza dello schermo ruota di un'inquadratura intera. */
    dragSensitivity: 1.1,
    /** false: trascini a destra -> la camera gira a destra (stile FPS). true: "afferri" il campo. */
    invertDrag: false,
    /** Ritardo con cui la camera insegue il dito (peso della camera). Più alto = più pesante. */
    followTime: 0.08,
    /** Quanto in fretta si spegne l'inerzia dopo aver alzato il dito (1/s). Più alto = si ferma prima. */
    releaseFriction: 5,
    /** Velocità massima di un "lancio" col dito (gradi/s). */
    maxFlickSpeed: 200,
    zoomFollowTime: 0.12,
    pinchSensitivity: 1,
    wheelZoomSpeed: 0.0015,
    /** Pulsanti zoom +/− a schermo (tenuti premuti): visibili e velocità (raddoppi di zoom ≈ 0,7/velocità secondi). */
    zoomButtons: true,
    buttonZoomSpeed: 1.3,
    /** Tastiera: velocità di pan in "inquadrature al secondo" e di zoom. */
    keyPanSpeed: 0.8,
    keyZoomSpeed: 1.2,
    /** Micro-oscillazione da camera a spalla (gradi). 0 = disattivata. */
    shakeAmplitude: 0.05,
    shakeSpeed: 0.7,
  },

  match: {
    durationSec: 180,
    /** Minuti "televisivi" mostrati sul cronometro (calcio 90, basket 40). */
    clockMinutes: 90,
    walkSpeed: 1.8,
    jogSpeed: 4,
    runSpeed: 6.5,
    sprintSpeed: 8.2,
    dribbleSpeed: 5,
    accel: 14,
    passSpeed: 16,
    shotSpeed: 24,
    /** Quanto tempo un giocatore tiene palla prima di decidere (s). */
    holdTimeMin: 0.8,
    holdTimeMax: 2.2,
    badPassChance: 0.15,
    /** Probabilità al secondo di perdere palla con un avversario attaccato. */
    tackleRate: 0.8,
    /** Pesi relativi dell'esito di un tiro quando l'evento non lo specifica. */
    shotOutcome: { goal: 0.35, save: 0.45, wide: 0.2 },
    celebrateSec: 4,
    resetSec: 3.5,
  },

  visuals: {
    /** Giocatori e palla un po' più grandi del reale, per leggibilità su schermo piccolo. */
    playerScale: 1.12,
    ballRadius: 0.11,
    ballScale: 2,
    /** Colori di arbitro, steward e tifoso invasore. */
    referee: { shirt: 0x161616, shorts: 0x161616, socks: 0x161616 },
    steward: { shirt: 0xff8a1f, shorts: 0x2a2f3a, socks: 0x2a2f3a },
    fan: { shirt: 0xff4fd8, shorts: 0x3b5bdb, socks: 0xf2f2f2 },
  },

  teams: [
    { name: 'AURORA', short: 'AUR', shirt: 0x2f6fde, shorts: 0xf2f2f2, socks: 0x1d3f8a, keeper: 0x2bd47a },
    { name: 'VULCANI', short: 'VUL', shirt: 0xe0403a, shorts: 0x1c1c1c, socks: 0x8a1f1b, keeper: 0xf2c230 },
  ],

  scoring: {
    /** Progressione: 1 = solo Copertura + Tempismo, 2 = + Taglia, 3 = tutte le voci. Anche ?level=1 nell'URL. */
    level: 3,
    levels: {
      1: ['coverage', 'timing'],
      2: ['coverage', 'size', 'timing'],
      3: ['coverage', 'size', 'composition', 'smoothness', 'timing'],
    } as Record<number, string[]>,
    /** Pesi delle 5 voci (rinormalizzati sulle voci attive). */
    weights: { coverage: 0.4, size: 0.2, composition: 0.15, smoothness: 0.15, timing: 0.1 },
    /** Quanto costa tagliare ciascun punto chiave. */
    keypoints: { head: 1, body: 0.8, feet: 0.5, hands: 0.05, ball: 1, goal: 0.6, area: 0.8 },
    /** Peso dei piedi nei primi piani (tagliarli lì è accettabile). */
    feetInCloseUp: 0,
    /** Bordo "sicuro" (frazione di mezza inquadratura) e sfumatura del punteggio appena fuori bordo. */
    edgeMargin: 0.03,
    edgeSoftness: 0.15,
    /** Altezza ideale del soggetto principale, in frazione dell'altezza dello schermo. */
    sizeTargets: { wide: 0.1, medium: 0.3, close: 0.7 },
    /** Rapporto di zoom (troppo largo o troppo stretto) a cui la Taglia vale 0. */
    sizeTolerance: 2.5,
    /** Margine attorno ai soggetti nell'inquadratura ideale. */
    framingMargin: 0.08,
    /** Spazio davanti a chi corre: il soggetto va sul terzo opposto (0.33 = regola dei terzi). */
    leadRoom: 0.33,
    /** Velocità laterale (m/s) oltre cui un soggetto "corre" e vuole spazio davanti. */
    leadRoomMinSpeed: 1.5,
    /** L'istante decisivo (± finestra in s) pesa N volte. */
    decisiveWeight: 3,
    decisiveWindow: 0.25,
    /** Copertura minima nell'istante decisivo: sotto = "mancato", massimo 2 stelle. */
    decisiveMissCoverage: 0.35,
    /** Copertura da cui la camera è "sul posto" (per il Tempismo). */
    onTargetCoverage: 0.75,
    /** Anticipo (s) che vale il massimo del Tempismo, e ritardo (s) che lo azzera. */
    anticipationGood: 0.6,
    maxLate: 1.0,
    /** Accelerazione media della camera (inquadrature/s²) che azzera la Fluidità. Più alto = più tollerante. */
    smoothAccelRef: 8,
    /** Soglie per 5, 4, 3, 2 stelle. */
    stars: [90, 70, 50, 30],
    /** Secondi di permanenza della scheda voto. */
    resultSec: 3.5,
  },

  director: {
    /** Prima azione principale dopo N secondi, poi una ogni [min, max] secondi (da inizio a inizio). */
    firstMainAt: 4,
    mainEvery: [10, 15],
    /** Distrazioni: la prima dopo N secondi, poi una ogni [min, max]. */
    firstDistractionAt: 20,
    distractionEvery: [18, 30],
    /** Probabilità che un'azione principale abbia una distrazione in contemporanea (dilemma). */
    dilemmaChance: 0.35,
    /** Entro questa frazione di partita un dilemma arriva comunque. */
    dilemmaBy: 0.5,
    /** Distanza minima (m) dalla palla per chi recita una distrazione. */
    distractionMinDist: 16,
    /** Chi è avanti di tanti gol non segna più (punteggio coerente). */
    maxGoalLead: 2,
    /** Gol totali "normali" a partita: oltre, le azioni da gol diventano rare; oltre budget + 2 si trasformano in parate. */
    goalBudget: 4,
    /** Probabilità di gol quando l'evento lascia decidere l'esito al Director. */
    goalChance: 0.3,
    /** Se un'azione resta bloccata per tanti secondi (es. palla persa), l'evento viene annullato. */
    abortAfter: 4,
  },

  voice: {
    /** Secondi di permanenza di una battuta del regista. */
    lineSec: 2.6,
    /** Quanti eventi ricevono un indizio in cuffia, e quanto spesso la direzione è giusta. */
    hintChance: 0.75,
    hintAccuracy: 0.85,
    /** Ordini: il primo dopo N secondi, poi uno ogni [min, max]. */
    firstOrderAt: 14,
    orderEvery: [20, 32],
    /** Tempo per reagire prima che l'ordine venga valutato, e durata della valutazione. */
    orderReact: 0.8,
    orderDuration: 3.2,
    /** Voto minimo per considerare l'ordine eseguito, e bonus in punti. */
    orderSuccess: 60,
    orderBonus: 300,
    /** Probabilità che un ordine sia "sbagliato" (dato proprio mentre parte un'azione importante). */
    wrongOrderChance: 0.2,
    /** Probabilità di un commento ironico dopo un voto. */
    commentChance: 0.6,
  },

  rare: {
    /** Probabilità che in una partita ci sia un evento raro (stella cadente). Forzalo con ?rare nell'URL. */
    chancePerMatch: 0.5,
    /** Quando può capitare, in frazione della partita. */
    window: [0.25, 0.8],
    /** Il bonus si moltiplica solo se l'ultima azione principale (entro mainWithin s) aveva almeno goodMainStars. */
    multiplier: 3,
    goodMainStars: 4,
    mainWithin: 15,
    /** Stelle minime perché la clip finisca nell'album. */
    captureStars: 3,
  },

  recorder: {
    /** Fotogrammi registrati al secondo e secondi tenuti in memoria (il replay interpola tra i fotogrammi). */
    hz: 30,
    seconds: 12,
  },

  replay: {
    enabled: true,
    /** Replay automatico per i momenti con almeno N stelle (gli eventi rari ripresi hanno sempre il replay). */
    minStars: 4,
    /** Secondi minimi tra due replay (non vale per gli eventi rari). */
    cooldown: 25,
    /** Secondi mostrati prima e dopo l'istante decisivo. */
    before: 1.8,
    after: 1.4,
    /** Velocità del replay, e velocità (più lenta) attorno all'istante decisivo (± slowWindow s). */
    speed: 0.6,
    slowSpeed: 0.3,
    slowWindow: 0.5,
  },

  indicators: {
    /** Indicatori ai bordi per l'attività fuori inquadratura: opacità massima e raggio (px). */
    maxAlpha: 0.6,
    radius: 70,
  },

  crowd: {
    rowsFar: 9,
    rowsEnd: 6,
    spacing: 0.8,
    /** Frazione di posti occupati. */
    fill: 0.85,
  },

  debug: {
    /** Modalità debug (attivabile anche con ?debug nell'URL). */
    enabled: false,
    showFps: true,
  },
};

// ==================================================================== SPORT

export type SportId = 'calcio' | 'basket';
type Base = typeof BASE;
type Overrides = { [K in keyof Base]?: Base[K] extends unknown[] ? Base[K] : Partial<Base[K]> };

/** Solo i numeri che cambiano rispetto al calcio. */
const SPORTS: Record<SportId, { name: string; over: Overrides }> = {
  calcio: { name: 'Calcio', over: {} },
  basket: {
    name: 'Basket',
    over: {
      /** Campetto all'aperto, di sera: 5 contro 5 su un campo regolamentare 28x15. */
      pitch: { length: 28, width: 15, goalName: 'Canestro' },
      camera: { position: { x: 0, y: 4, z: 13.5 }, startPitch: -11, startFov: 44, fovMax: 62 },
      match: {
        clockMinutes: 40,
        walkSpeed: 1.5, jogSpeed: 3.2, runSpeed: 5.2, sprintSpeed: 7, dribbleSpeed: 4.2,
        passSpeed: 10, shotSpeed: 7,
        holdTimeMin: 0.6, holdTimeMax: 1.6,
        badPassChance: 0.08,
        tackleRate: 0.12,
        celebrateSec: 2.2,
      },
      visuals: { playerScale: 1.2, ballRadius: 0.12, ballScale: 1.7 },
      teams: [
        { name: 'LUPI', short: 'LUP', shirt: 0x7b3fe4, shorts: 0x7b3fe4, socks: 0xf2f2f2, keeper: 0x7b3fe4 },
        { name: 'DELFINI', short: 'DEL', shirt: 0x12b5c9, shorts: 0x0d5e6b, socks: 0x0d5e6b, keeper: 0x12b5c9 },
      ],
      /** Ritmo più alto: nel basket si cambia giocatore in continuazione. Punteggio in punti, non in gol. */
      director: {
        firstMainAt: 3, mainEvery: [8, 11],
        firstDistractionAt: 14, distractionEvery: [15, 24],
        distractionMinDist: 7,
        maxGoalLead: 10, goalBudget: 999, goalChance: 0.5,
      },
      crowd: { rowsFar: 7, rowsEnd: 5 },
    },
  },
};

const param = new URLSearchParams(globalThis.location?.search ?? '').get('sport');
/** Sport della partita: ?sport=basket nell'URL (la schermata iniziale lo imposta). */
export const SPORT: SportId = param && param in SPORTS ? (param as SportId) : 'calcio';
export const SPORT_LIST = Object.entries(SPORTS).map(([id, s]) => ({ id: id as SportId, name: s.name }));

const over = SPORTS[SPORT].over as Record<string, unknown>;
for (const [k, v] of Object.entries(over)) {
  const key = k as keyof Base;
  (BASE as Record<string, unknown>)[key] = Array.isArray(v) ? v : { ...BASE[key], ...(v as object) };
}
export const CONFIG = BASE;
