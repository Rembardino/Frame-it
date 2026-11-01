// Reviewed roles for every supplied animation. No filename suffix is discarded.
export function categories(file) {
  const n=file.replace(/^.*\//,'').replace(/\.fbx$/i,'').replace(/ \(\d+\)$/,'').toLowerCase();
  if (/scissor kick|bicycle kick/.test(n)) return ['footballAcrobatic'];
  if (/fallen idle/.test(n)) return ['fallenIdle'];
  if (/standing up/.test(n)) return ['getUp'];
  if (/transition/.test(n)) return ['footballEntry'];
  if (/soccer trip/.test(n)) return ['trip'];
  if (/jog backward/.test(n)) return ['backward'];
  if (/jog strafe left/.test(n)) return ['stepLeft'];
  if (/jog strafe right/.test(n)) return ['stepRight'];
  if (/soccer|dribble|throw in|offensive idle/.test(n) && /turn/.test(n)) return ['footballTurn'];
  if (/dancing|capoeira/.test(n)) return ['celebration'];
  if (/golf putt victory/.test(n)) return ['golfVictory'];
  if (/golf bad/.test(n)) return ['golfBad'];
  if (/golf post/.test(n)) return ['golfFollow'];
  if (/golf chip/.test(n)) return ['golfChip'];
  if (/golf drive/.test(n)) return ['golfDrive'];
  if (/golf putt/.test(n)) return ['golfPutt'];
  if (/goalkeeper/.test(n)) {
    if (/idle/.test(n)) return ['keeperIdle'];
    if (/sidestep/.test(n)) return ['keeperStep'];
    if (/diving/.test(n)) return ['keeperDive'];
    if (/body block/.test(n)) return ['keeperBlock'];
    if (/catch|scoop/.test(n)) return ['keeperCatch'];
    if (/miss/.test(n)) return ['keeperMiss'];
    if (/drop kick/.test(n)) return ['keeperKick'];
    if (/overhand/.test(n)) return ['keeperThrow'];
    if (/pass/.test(n)) return ['keeperPass'];
    if (/placing/.test(n)) return ['keeperPlace'];
    if (/directing/.test(n)) return ['keeperDirect'];
  }
  if (/soccer|dribble|throw in|offensive idle/.test(n)) {
    if (/header|kneeing/.test(n)) return [/kneeing/.test(n)?'footballKnee':'footballHeader'];
    if (/tackle/.test(n)) return ['footballTackle'];
    if (/penalty|kick soccerball/.test(n)) return ['footballShot'];
    if (/kick up|stall/.test(n)) return ['footballTrick'];
    if (/receive/.test(n)) return ['footballReceive'];
    if (/pass/.test(n)) return ['footballPass'];
    if (/throw in/.test(n)) return ['footballThrow'];
    if (/spin|change direction/.test(n)) return ['footballTurn'];
    if (/dribble/.test(n)) return ['footballDribble'];
    if (/idle/.test(n)) return ['footballIdle'];
    if (/run/.test(n)) return ['run'];
  }
  if (/football catch/.test(n)) return ['keeperCatch'];
  if (/counting/.test(n)) return ['refCount'];
  if (/getting up|zombie stand/.test(n)) return ['getUp'];
  if (/knocked down|knocked out|fall flat/.test(n)) return ['knockdown'];
  if (/tripping/.test(n)) return ['trip'];
  if (/crawling/.test(n)) return ['crawl'];
  if (/hit|uppercut to|receiving an/.test(n)) return ['boxingRecoil'];
  if (/block/.test(n)) return ['boxingBlock'];
  if (/dodg/.test(n)) return ['boxingDodge'];
  if (/jab cross|combo|body jab|punching bag|uppercut jab|jab to elbow/.test(n)) return ['boxingCombo'];
  if (/hook/.test(n)) return ['boxingHook'];
  if (/lead jab|cross punch|punching$|mutant punch/.test(n)) return ['boxingJab'];
  if (/standing idle to fight/.test(n)) return ['boxingEntry'];
  if (/step backward/.test(n)) return ['backward'];
  if (/left side step/.test(n)) return ['stepLeft'];
  if (/right side step/.test(n)) return ['stepRight'];
  if (/step forward/.test(n)) return ['boxingStep'];
  if (/left turn|right turn|change direction/.test(n)) return ['turn'];
  if (/sprint|run|jog/.test(n)) return ['run'];
  if (/walking_box/.test(n)) return ['boxingWalk'];
  if (/walk/.test(n)) return ['walk'];
  if (/idle/.test(n)) return ['idle'];
  if (/defeated/.test(n)) return ['dejected'];
  if (/praying/.test(n)) return ['praying','celebration'];
  if (/kiss/.test(n)) return ['kiss','celebration'];
  if (/phone/.test(n)) return ['phone'];
  if (/entry/.test(n)) return ['entry'];
  // These are stabbing gestures. Keep them in the audit, out of sporting actions.
  if (/stabbing/.test(n)) return [];
  throw new Error(`Unclassified animation: ${file}`);
}
