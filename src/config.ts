import { TEST, applyUpgrades, loadCareer, readPending } from './career/career';

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
    shadows: true,
    shadowMapSize: 1024,
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
    /** Giroscopio: guadagno, tremolio ignorato (gradi del telefono) e filtro in secondi. */
    gyroSensitivity: 0.45,
    gyroDeadZone: 0.35,
    gyroFollowTime: 0.14,
    /** Testa motorizzata (carriera): quanto in fretta la camera va da sola sulla palla quando non la tocchi (1/s). 0 = spenta. */
    autoTrack: 0,
    /** Drone (carriera): secondi di volo a partita (0 = non ce l'hai), velocità massima (m/s) e prontezza (1/s). */
    droneBattery: 0,
    droneSpeed: 7,
    droneResponse: 0.9,
    /** Telecomando del drone: rotazione con la leva sinistra (gradi/s per ogni grado di FOV: a FOV 42 ≈ 55°/s, zoomato più lenta),
     *  zona morta al centro delle leve (0..1) ed expo (0 = lineare, 1 = molto fine vicino al centro). */
    droneYawSpeed: 1.3,
    droneDeadZone: 0.08,
    droneExpo: 0.45,
    /** Velocità del drone (pulsante sopra la leva sinistra): moltiplicatori di velocità e rotazione,
     *  prontezza (1/s: bassa = parte e si ferma morbido). CINE per le riprese, SPORT per spostarsi in fretta. */
    droneModes: {
      cine: { speed: 0.35, turn: 0.5, response: 1.5 },
      normal: { speed: 1, turn: 1, response: 3 },
      sport: { speed: 1.7, turn: 1.4, response: 4.5 },
    },
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
    /** Dopo l'esultanza: secondi prima del calcio d'inizio. Se dopo resetCutSec qualcuno è ancora fuori posto, stacco TV: tutti al loro posto, 1 s di squadre schierate, fischio. */
    resetSec: 3.5,
    resetCutSec: 2.5,
  },

  visuals: {
    /** Giocatori e palla un po' più grandi del reale, per leggibilità su schermo piccolo. */
    playerScale: 1.12,
    /** Spettatori dei momenti segreti: un po' più grandi del pubblico, così si notano (più alto = più evidenti). */
    spectatorScale: 1.15,
    ballRadius: 0.11,
    ballScale: 2,
    /** Breve raccordo fra due gesti, registrato anche nei replay. */
    poseBlendSec: 0.18,
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
    /** Zona "perfetta" (vale 100): zoom entro ±N volte l'ideale, soggetto entro N (frazione di mezzo schermo)
     *  dal punto ideale, accelerazione della camera sotto N inquadrature/s². Più larghi = 100 più facile. */
    perfectZoom: 1.25,
    perfectComposition: 0.2,
    perfectSmooth: 1.5,
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
    /** Inquadratura N volte più larga dell'ideale nell'istante decisivo: massimo 2 stelle (0 = regola spenta).
     *  Serve nei campi piccoli (boxe, tennis), dove da fermi si vede tutto e la Copertura è piena gratis. */
    decisiveTooWide: 0,
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
    /** Boxe: il regista vuole il primo piano dei due pugili da N secondi prima del primo colpo
     *  fino a N secondi dopo l'ultimo, poi si torna larghi. Più anticipo = più tempo per stringere. */
    boxingCloseUpBefore: 0.6,
    boxingCloseUpAfter: 0.8,
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

  secrets: {
    /** Momenti segreti (in tribuna, a bordo campo): il primo dopo N secondi, poi uno ogni [min, max]. Mai annunciati. */
    firstAt: 15,
    every: [14, 26],
    /** Si accorgono della camera (e il bonus è pieno) quando sono TUTTI nell'inquadratura (copertura ≥ noticeCoverage)
     *  e alti almeno noticeScreen dello schermo (basta un filo di zoom). Tempo di reazione in s. */
    noticeCoverage: 0.95,
    noticeScreen: 0.06,
    reactDelay: 0.35,
    /** Moltiplicatore dei punti rispetto a un'azione normale. */
    bonus: 2,
  },

  highlights: {
    /** Clip candidate per FrameTube a fine partita di carriera: azioni con almeno minStars (gli eventi rari e virali sempre). */
    minStars: 3,
    /** Quante candidate si tengono (le migliori per punti) e quante se ne possono scegliere. */
    keep: 6,
    pick: 3,
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
    /** Velocità della scritta che scorre nella fascia in basso del replay (lettere al secondo). */
    tickerSpeed: 9,
  },

  audio: {
    /** Audio spento finché il giocatore non lo accende dal pulsante (la scelta viene salvata). */
    defaultOn: false,
    /** Voci del regista e dei personaggi: false = nessuna voce (la bocca si muove lo stesso). */
    speech: false,
    /** Volume generale (0..1) e dei singoli gruppi. */
    master: 0.8,
    crowd: 0.08,
    sfx: 0.9,
    voices: 0.9,
    drone: 0.04,
    /** 'auto' = voce vera del dispositivo quando c'è (altrimenti inventata); 'invented' = sempre voce inventata. */
    voice: 'auto' as 'auto' | 'invented',
    /** Altezza (Hz) della voce inventata del regista. */
    directorPitch: 112,
    /** Un personaggio non riparla prima di N secondi; al massimo N personaggi parlano insieme. */
    sayCooldown: 2.5,
    maxVoices: 3,
  },

  golf: {
    /** Buche a partita: si parte da una buca a caso del percorso (6 buche) e si gioca le successive. */
    holesPerRound: 3,
    /** Palla ferma: secondi prima dello stacco TV (golfisti già sulla palla), poi secondi prima del colpo. */
    restSec: 2.5,
    readySec: 3,
    /** Secondo del copione in cui parte lo swing (prima: routine e marshal col cartello) e quello del putt. */
    swingAt: 2.6,
    puttAt: 2.1,
    /** Dall'inizio dello swing (o del putt) all'impatto con la palla. */
    impact: 0.85,
    puttImpact: 0.5,
    /** Secondi di volo, altezza massima (m) e secondi dall'atterraggio a palla ferma, per tipo di colpo. */
    carry: { drive: 6.2, tee3: 5.4, wood: 6, approach: 5, chip: 1.6, bunker: 1.9, putt: 0 },
    apex: { drive: 32, tee3: 27, wood: 28, approach: 24, chip: 3.5, bunker: 6, putt: 0 },
    roll: { drive: 3, tee3: 2.2, wood: 2.6, approach: 2.2, chip: 2.2, bunker: 1.8, putt: 0 },
    /** Secondi di rotolamento del putt, per esito (imbucato corto/medio/lungo, a un passo, sul bordo). */
    putt: { puttShort: 1.6, putt: 2.6, puttLong: 3.6, puttLag: 3.2, puttLip: 2.8 } as Record<string, number>,
    /** Scia luminosa della palla (come in TV): secondi di vita dopo l'atterraggio e spessore in pixel. */
    tracerSec: 4,
    tracerWidth: 3,
  },

  cycling: {
    /** Corridori (per squadra) e velocità del gruppo (m/s): il gruppo regola il passo per arrivare al traguardo verso la fine. */
    ridersPerTeam: 7,
    packSpeed: [9, 15],
    /** Secondo della diretta in cui il gruppo vuole arrivare al traguardo. */
    arriveSec: 165,
    /** Nel paese c'è uno strappo: il gruppo rallenta (frazione della velocità). */
    villageSlow: 0.62,
    /** Scatto: metri/secondo in più e vantaggio massimo (m). Volata: secondi dal via allo striscione. */
    attackBoost: 4,
    attackGap: 40,
    sprintSec: 14,
    /** Peso dei corridori: accelerazione e frenata (m/s²); nella volata si accelera di più. */
    accel: 1.8,
    brake: 3,
    sprintAccel: 3,
    /** Curve: accelerazione laterale massima (m/s²). Più bassa = si frena di più prima dei tornanti. */
    bendGrip: 6,
  },

  sailing: {
    /** Velocità (m/s) di bolina, di poppa e al lasco finale; sopra liftSpeed la barca si alza sui foil. */
    upwind: 12,
    downwind: 19,
    reach: 17,
    liftSpeed: 9,
    /** Una virata dura tackSec secondi (la barca rallenta e cambia mura). */
    tackSec: 3.2,
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

export type SportId = 'calcio' | 'basket' | 'boxe' | 'tennis' | 'pallavolo' | 'golf' | 'ciclismo' | 'vela';
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
  boxe: {
    name: 'Boxe',
    over: {
      pitch: { length: 6.1, width: 6.1, goalName: 'Ring' },
      camera: { position: { x: 0, y: 3, z: 8.5 }, startPitch: -10, startFov: 45, fovMax: 65 },
      scoring: { decisiveTooWide: 2 },
      match: { clockMinutes: 9, runSpeed: 2.8, sprintSpeed: 3.5, walkSpeed: 1, accel: 10 },
      visuals: { playerScale: 1.05 },
      teams: [
        { name: 'ROSSO', short: 'ROS', shirt: 0xcc3547, shorts: 0xcc3547, socks: 0x202433, keeper: 0xcc3547 },
        { name: 'BLU', short: 'BLU', shirt: 0x3878df, shorts: 0x3878df, socks: 0x202433, keeper: 0x3878df },
      ],
      director: { firstMainAt: 3, mainEvery: [9, 13], distractionMinDist: 2, goalBudget: 999 },
      crowd: { rowsFar: 5, rowsEnd: 4 },
    },
  },
  tennis: {
    name: 'Tennis',
    over: {
      pitch: { length: 23.77, width: 10.97, goalName: 'Rete' },
      camera: { position: { x: 1.8, y: 5, z: 18 }, startYaw: -5.7, startPitch: -12, startFov: 46, fovMax: 64 },
      scoring: { decisiveTooWide: 2 },
      match: { clockMinutes: 30, runSpeed: 6, sprintSpeed: 7, accel: 18 },
      visuals: { ballRadius: 0.034, ballScale: 3.5 },
      teams: [
        { name: 'ROSSI', short: 'ROS', shirt: 0xf27342, shorts: 0xffffff, socks: 0xffffff, keeper: 0xf27342 },
        { name: 'BIANCHI', short: 'BIA', shirt: 0x64d5bd, shorts: 0x203653, socks: 0xffffff, keeper: 0x64d5bd },
      ],
      director: { firstMainAt: 3, mainEvery: [11, 15], distractionMinDist: 3, goalBudget: 999 },
      crowd: { rowsFar: 6, rowsEnd: 4 },
    },
  },
  pallavolo: {
    name: 'Pallavolo',
    over: {
      pitch: { length: 18, width: 9, goalName: 'Rete' },
      camera: { position: { x: 1.5, y: 4.5, z: 14 }, startYaw: -6.1, startPitch: -8, startFov: 46, fovMax: 66 },
      scoring: { decisiveTooWide: 2 },
      match: { clockMinutes: 25, runSpeed: 4.5, sprintSpeed: 6, accel: 18 },
      visuals: { playerScale: 1.1, ballRadius: 0.105, ballScale: 1.8 },
      teams: [
        { name: 'FALCHI', short: 'FAL', shirt: 0xf5bd32, shorts: 0x1d345a, socks: 0xffffff, keeper: 0xf5bd32 },
        { name: 'AQUILE', short: 'AQU', shirt: 0xe95d78, shorts: 0x25344c, socks: 0xffffff, keeper: 0xe95d78 },
      ],
      director: { firstMainAt: 3, mainEvery: [11, 15], distractionMinDist: 3, goalBudget: 999 },
      crowd: { rowsFar: 6, rowsEnd: 4 },
    },
  },
  golf: {
    name: 'Golf',
    over: {
      /** Il percorso: 6 buche su 900x600 m (le buche stanno in sim/sports/golfCourse.ts). Si riprende solo col drone. */
      pitch: { length: 900, width: 600, goalName: 'Bandiera' },
      /** droneSpeed qui è in m/s veri (negli altri sport si scala col campo). */
      camera: { startFov: 42, fovMin: 2, fovMax: 62, droneSpeed: 42, shakeAmplitude: 0.03 },
      /** Allargare troppo dall'alto non basta: nell'istante decisivo serve almeno un terzo dello zoom giusto. */
      scoring: { decisiveTooWide: 3 },
      match: { durationSec: 300, walkSpeed: 1.4, jogSpeed: 2.6, runSpeed: 5.5, sprintSpeed: 7 },
      visuals: {
        playerScale: 1.12, ballRadius: 0.0214, ballScale: 3,
        /** Il marshal (giacca verde, pantaloni chiari) col cartello del silenzio. */
        referee: { shirt: 0x245a3a, shorts: 0xd9cfb4, socks: 0x2a2a2a },
      },
      /** Una coppia a colpi alternati. socks = pettorina del caddie. */
      teams: [
        { name: 'MARCO', short: 'MAR', shirt: 0x1f3f7a, shorts: 0xe8e2d2, socks: 0xf4f4f4, keeper: 0x1f3f7a },
        { name: 'GIULIA', short: 'GIU', shirt: 0xe0557d, shorts: 0x3b4252, socks: 0xf4f4f4, keeper: 0xe0557d },
      ],
      /** Ogni colpo è un'azione: parte appena il golfista è sulla palla. Le distrazioni succedono lontano, vicino al green. */
      director: {
        firstMainAt: 2, mainEvery: [0.5, 1], firstDistractionAt: 30, distractionEvery: [26, 40],
        dilemmaChance: 0.25, dilemmaBy: 2, goalBudget: 999,
      },
      /** Replay più lunghi: si rivede tutto il volo con la scia. */
      replay: { before: 4.5, after: 2.2, cooldown: 30 },
      /** Buca in uno: arriva sul primo par 3 dopo l'ora estratta (?rare la forza). */
      rare: { chancePerMatch: 0.35, window: [0, 0.7] },
      audio: { crowd: 0.035 },
    },
  },
  ciclismo: {
    name: 'Ciclismo',
    over: {
      /** Gli ultimi 2 km di una tappa in campagna (strada in sim/sports/cyclingRoute.ts). Solo drone. */
      pitch: { length: 1800, width: 1100, goalName: 'Traguardo' },
      camera: { startFov: 42, fovMin: 2, fovMax: 62, droneSpeed: 42, shakeAmplitude: 0.03 },
      scoring: { decisiveTooWide: 3 },
      /** Velocità del gruppo in CONFIG.cycling; sprintSpeed = il tifoso che corre accanto ai corridori. */
      match: { durationSec: 300, walkSpeed: 1.4, jogSpeed: 3, runSpeed: 6.5, sprintSpeed: 9 },
      visuals: { playerScale: 1.08 },
      director: {
        firstMainAt: 3, mainEvery: [8, 12], firstDistractionAt: 16, distractionEvery: [16, 26],
        dilemmaChance: 0.3, dilemmaBy: 2, goalBudget: 999,
      },
      replay: { before: 3, after: 2 },
      rare: { chancePerMatch: 0.4, window: [0.2, 0.7] },
      audio: { crowd: 0.05 },
    },
  },
  vela: {
    name: 'Vela',
    over: {
      /** Regata di catamarani volanti: partenza, bolina, poppa, arrivo (campo in sim/sports/sailing.ts). Solo drone. */
      pitch: { length: 2000, width: 1400, goalName: 'Boa' },
      camera: { startFov: 42, fovMin: 2, fovMax: 62, droneSpeed: 42, shakeAmplitude: 0.03 },
      scoring: { decisiveTooWide: 3 },
      match: { durationSec: 300 },
      visuals: { playerScale: 1.05 },
      /** Due team con due barche ciascuno (due velisti per barca). */
      teams: [
        { name: 'GRECALE', short: 'GRE', shirt: 0xd8393f, shorts: 0x22262e, socks: 0xf2f2f2, keeper: 0xd8393f },
        { name: 'MAESTRALE', short: 'MAE', shirt: 0x15a6b8, shorts: 0x22262e, socks: 0xf2f2f2, keeper: 0x15a6b8 },
      ],
      director: {
        firstMainAt: 3.5, mainEvery: [8, 12], firstDistractionAt: 18, distractionEvery: [18, 28],
        dilemmaChance: 0.3, dilemmaBy: 2, goalBudget: 999,
      },
      replay: { before: 3.5, after: 2 },
      rare: { chancePerMatch: 0.4, window: [0.2, 0.7] },
      audio: { crowd: 0.03 },
    },
  },
};

/** Sport che si riprendono solo col drone (mondi enormi, all'aperto). */
export const DRONE_SPORTS: SportId[] = ['golf', 'ciclismo', 'vela'];

const param = new URLSearchParams(globalThis.location?.search ?? '').get('sport');
/** Sport della partita: ?sport=basket nell'URL (la schermata iniziale lo imposta). */
export const SPORT: SportId = param && param in SPORTS ? (param as SportId) : 'calcio';
export const SPORT_LIST = Object.entries(SPORTS).map(([id, s]) => ({ id: id as SportId, name: s.name }));
export const DRONE_ONLY = DRONE_SPORTS.includes(SPORT);

const over = SPORTS[SPORT].over as Record<string, unknown>;
for (const [k, v] of Object.entries(over)) {
  const key = k as keyof Base;
  (BASE as Record<string, unknown>)[key] = Array.isArray(v) ? v : { ...BASE[key], ...(v as object) };
}
const pending = readPending();
/** Partita della modalità Carriera (scelta dal menu Carriera); null = modalità libera, senza potenziamenti. */
export const CAREER = pending && pending.sport === SPORT ? pending : null;
if (CAREER || TEST) applyUpgrades(BASE as never, loadCareer(), SPORT);
export const CONFIG = BASE;
