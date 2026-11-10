// Quaternius Unreal/Godot and Mixamo rigs share the game's anatomical joint names.
export function anatomicalName(name) {
  if (/^mixamorig\d*:?/.test(name)) return name.replace(/^mixamorig\d*:?/, '');
  const fixed={pelvis:'Hips',spine_01:'Spine',spine_02:'Spine1',spine_03:'Spine2',neck_01:'Neck',Head:'Head',root:'Root'};
  if(fixed[name])return fixed[name];
  const side=name.endsWith('_l')?'Left':name.endsWith('_r')?'Right':null;
  if(!side)return name;
  const base=name.slice(0,-2),limbs={clavicle:'Shoulder',upperarm:'Arm',lowerarm:'ForeArm',hand:'Hand',thigh:'UpLeg',calf:'Leg',foot:'Foot',ball:'ToeBase',ball_leaf:'Toe_End'};
  if(limbs[base])return side+limbs[base];
  const finger=base.match(/^(thumb|index|middle|ring|pinky)_(\d+)(?:_leaf)?$/);
  return finger?side+'Hand'+finger[1][0].toUpperCase()+finger[1].slice(1)+Number(finger[2]):name;
}
