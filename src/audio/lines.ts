/**
 * Frasi dei personaggi in campo, in 5 lingue (brevi: si urlano). Il regista usa le sue battute (director/lines.ts).
 * Per aggiungerne una: scrivila in tutte le lingue nella categoria giusta.
 */
import type { Language } from '../i18n';

export type Shout =
  | 'call' | 'protest' | 'argue' | 'shove' | 'ouch' | 'goal' | 'basket' | 'celebrate' | 'dejected'
  | 'coach' | 'card' | 'foul' | 'count' | 'fan' | 'steward' | 'hide' | 'yes'
  /** Golf: il marshal prima del colpo, il compagno quando la palla va verso alberi o acqua. */
  | 'quiet' | 'fore'
  /** Momenti segreti: rapito dagli alieni, gabbiano in testa, cane che scappa. */
  | 'help' | 'shoo' | 'dog';

export const SHOUTS: Record<Shout, Record<Language, string[]>> = {
  call: {
    it: ['Passala!', 'Qui, qui!', 'Sono libero!', 'Dammela!'],
    en: ['Pass it!', 'Here, here!', 'I’m open!', 'Give it!'],
    es: ['¡Pásala!', '¡Aquí, aquí!', '¡Estoy solo!', '¡Dámela!'],
    fr: ['Passe-la !', 'Ici, ici !', 'Je suis seul !', 'Donne !'],
    de: ['Spiel ab!', 'Hier, hier!', 'Ich bin frei!', 'Gib her!'],
  },
  protest: {
    it: ['Ma arbitro!', 'Non l’ho toccato!', 'Era pulito!', 'Ma dai!'],
    en: ['Come on, ref!', 'I didn’t touch him!', 'That was clean!', 'No way!'],
    es: ['¡Venga, árbitro!', '¡No lo he tocado!', '¡Fue limpio!', '¡Que no!'],
    fr: ['Allez, l’arbitre !', 'Je ne l’ai pas touché !', 'C’était propre !', 'Mais non !'],
    de: ['Schiri, bitte!', 'Ich hab ihn nicht berührt!', 'Das war sauber!', 'Niemals!'],
  },
  argue: {
    it: ['Ma che fai?!', 'Guarda dove vai!', 'Ma sei matto?!'],
    en: ['What are you doing?!', 'Watch where you’re going!', 'Are you crazy?!'],
    es: ['¿¡Qué haces!?', '¡Mira por dónde vas!', '¿¡Estás loco!?'],
    fr: ['Tu fais quoi ?!', 'Regarde où tu vas !', 'T’es fou ?!'],
    de: ['Was soll das?!', 'Pass doch auf!', 'Spinnst du?!'],
  },
  shove: {
    it: ['Ehi! Calma!', 'Levati!'],
    en: ['Hey! Easy!', 'Back off!'],
    es: ['¡Eh! ¡Tranquilo!', '¡Apártate!'],
    fr: ['Hé ! Du calme !', 'Recule !'],
    de: ['Hey! Ruhig!', 'Weg da!'],
  },
  ouch: {
    it: ['Ahi!', 'Ahia, la caviglia!'],
    en: ['Ouch!', 'Ow, my ankle!'],
    es: ['¡Ay!', '¡Ay, el tobillo!'],
    fr: ['Aïe !', 'Aïe, ma cheville !'],
    de: ['Au!', 'Au, mein Knöchel!'],
  },
  goal: {
    it: ['Gooooool!', 'Gol! Gol!'],
    en: ['Gooooal!', 'Goal! Goal!'],
    es: ['¡Gooooool!', '¡Gol! ¡Gol!'],
    fr: ['Buuuut !', 'But ! But !'],
    de: ['Toooor!', 'Tor! Tor!'],
  },
  basket: {
    it: ['Canestro!', 'Dentro!'],
    en: ['Bucket!', 'Count it!'],
    es: ['¡Canasta!', '¡Adentro!'],
    fr: ['Panier !', 'Dedans !'],
    de: ['Korb!', 'Drin!'],
  },
  celebrate: {
    it: ['Sììì!', 'Vai così!', 'Grande!', 'Andiamo!'],
    en: ['Yesss!', 'That’s it!', 'Great!', 'Come on!'],
    es: ['¡Sííí!', '¡Así se hace!', '¡Grande!', '¡Vamos!'],
    fr: ['Ouiii !', 'C’est ça !', 'Génial !', 'Allez !'],
    de: ['Jaaa!', 'Genau so!', 'Super!', 'Komm schon!'],
  },
  dejected: {
    it: ['Nooo…', 'Accidenti…', 'Che peccato…'],
    en: ['Nooo…', 'Damn it…', 'What a shame…'],
    es: ['Nooo…', 'Vaya…', 'Qué pena…'],
    fr: ['Nooon…', 'Zut…', 'Quel dommage…'],
    de: ['Neiiin…', 'Mist…', 'Wie schade…'],
  },
  coach: {
    it: ['Forza ragazzi!', 'Pressing, pressing!', 'Svegliatevi!', 'Coprite!'],
    en: ['Come on, lads!', 'Press, press!', 'Wake up!', 'Cover!'],
    es: ['¡Vamos, chicos!', '¡Presión, presión!', '¡Despertad!', '¡Cubrid!'],
    fr: ['Allez les gars !', 'Pressing, pressing !', 'Réveillez-vous !', 'Couvrez !'],
    de: ['Los, Jungs!', 'Pressing, Pressing!', 'Wacht auf!', 'Absichern!'],
  },
  card: {
    it: ['Ammonito!', 'Basta proteste!'],
    en: ['Booked!', 'Enough complaining!'],
    es: ['¡Amonestado!', '¡Basta de protestas!'],
    fr: ['Averti !', 'Assez de contestations !'],
    de: ['Verwarnung!', 'Schluss mit Meckern!'],
  },
  foul: {
    it: ['Fallo!', 'Punizione!'],
    en: ['Foul!', 'Free kick!'],
    es: ['¡Falta!', '¡Tiro libre!'],
    fr: ['Faute !', 'Coup franc !'],
    de: ['Foul!', 'Freistoß!'],
  },
  count: {
    it: ['Uno… due… tre… quattro…'],
    en: ['One… two… three… four…'],
    es: ['Uno… dos… tres… cuatro…'],
    fr: ['Un… deux… trois… quatre…'],
    de: ['Eins… zwei… drei… vier…'],
  },
  fan: {
    it: ['Wooo! Siamo i migliori!', 'Ciao mamma!'],
    en: ['Wooo! We’re the best!', 'Hi mum!'],
    es: ['¡Wooo! ¡Somos los mejores!', '¡Hola, mamá!'],
    fr: ['Wouhou ! On est les meilleurs !', 'Coucou maman !'],
    de: ['Wooo! Wir sind die Besten!', 'Hallo Mama!'],
  },
  hide: {
    it: ['Oddio, la telecamera!', 'Non riprendermi!', 'Giù, giù!'],
    en: ['Oh no, the camera!', 'Don’t film me!', 'Get down!'],
    es: ['¡Ay no, la cámara!', '¡No me grabes!', '¡Agáchate!'],
    fr: ['Oh non, la caméra !', 'Ne me filme pas !', 'Baisse-toi !'],
    de: ['Oh nein, die Kamera!', 'Nicht filmen!', 'Runter, runter!'],
  },
  yes: {
    it: ['Sì! Lo voglio!', 'Sììì!'],
    en: ['Yes! I do!', 'Yesss!'],
    es: ['¡Sí! ¡Quiero!', '¡Sííí!'],
    fr: ['Oui ! Je le veux !', 'Ouiii !'],
    de: ['Ja! Ich will!', 'Jaaa!'],
  },
  steward: {
    it: ['Fermati!', 'Fuori dal campo!'],
    en: ['Stop right there!', 'Off the pitch!'],
    es: ['¡Alto!', '¡Fuera del campo!'],
    fr: ['Arrête-toi !', 'Hors du terrain !'],
    de: ['Stehen bleiben!', 'Runter vom Platz!'],
  },
  quiet: {
    it: ['Silenzio, prego!'],
    en: ['Quiet, please!'],
    es: ['¡Silencio, por favor!'],
    fr: ['Silence, s’il vous plaît !'],
    de: ['Ruhe, bitte!'],
  },
  fore: {
    it: ['Fore!', 'Palla!'],
    en: ['Fore!'],
    es: ['¡Fore!', '¡Bola!'],
    fr: ['Fore !', 'Balle !'],
    de: ['Fore!'],
  },
  help: {
    it: ['Aiutoooo!', 'Mettetemi giù!'],
    en: ['Heeelp!', 'Put me down!'],
    es: ['¡Socorroooo!', '¡Bajadme!'],
    fr: ['Au secouuurs !', 'Posez-moi !'],
    de: ['Hiiilfe!', 'Lasst mich runter!'],
  },
  shoo: {
    it: ['Sciò! Sciò!', 'Via, pennuto!'],
    en: ['Shoo! Shoo!', 'Get off, bird!'],
    es: ['¡Fuera! ¡Fuera!', '¡Quita, pajarraco!'],
    fr: ['Ouste ! Ouste !', 'Dégage, l’oiseau !'],
    de: ['Husch! Husch!', 'Weg da, Vogel!'],
  },
  dog: {
    it: ['Fido! Torna qui!', 'Fermo! Seduto!'],
    en: ['Rex! Come back!', 'Stop! Sit!'],
    es: ['¡Toby! ¡Vuelve!', '¡Quieto! ¡Sentado!'],
    fr: ['Médor ! Reviens !', 'Stop ! Assis !'],
    de: ['Bello! Komm zurück!', 'Stopp! Sitz!'],
  },
};
