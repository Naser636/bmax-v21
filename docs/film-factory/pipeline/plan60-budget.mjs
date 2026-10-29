const CAP=4000;
const minutes=60, avgShotSec=9;                     // stylized/limited-animation → longer shots
const shots=Math.round(minutes*60/avgShotSec);      // ~400
const stillFrac=0.70, videoFrac=0.30;
const stills=Math.round(shots*stillFrac), videos=shots-stills;
// cost model (EST, NON_VERIFIED; benchmark calibrates)
const gensPerStill=3, costPerStillGen=0.04;         // Midjourney effective
const gensPerVideo=5, costPerVideoGen=0.9;          // ~8s clip incl retakes (Kling/Runway blend)
const stillCost=stills*gensPerStill*costPerStillGen;
const videoCost=videos*gensPerVideo*costPerVideoGen;
const voiceCost=180;                                // ElevenLabs ~60min dialogue (Pro ~1-2 mo)
const musicCost=30, subsCost=360;                   // Suno + stack 3 months
const postCost=0;                                   // DaVinci free + ffmpeg
const styleA = Math.round(stillCost+videoCost+voiceCost+musicCost+subsCost+postCost);
// full photoreal benchmark: $315-750/finished min
const photoLo=Math.round(60*315*0.92), photoHi=Math.round(60*750*0.92); // USD->EUR ~0.92
console.log(JSON.stringify({shots, stills, videos,
  styleA_stylized_estimate_eur: styleA, styleA_underCap: styleA<=CAP,
  styleA_breakdown:{stillCost:Math.round(stillCost),videoCost:Math.round(videoCost),voiceCost,musicCost,subsCost},
  full_photoreal_eur_range:[photoLo,photoHi], photoreal_vs_cap:`${(photoLo/CAP).toFixed(1)}x–${(photoHi/CAP).toFixed(1)}x over €4k`,
  verdict:"60min+€4k feasible ONLY stylized+controlled-retakes (UNPROVEN until benchmark); full photoreal 60min = "+photoLo+"–"+photoHi+" EUR = infeasible under cap"
},null,1));
