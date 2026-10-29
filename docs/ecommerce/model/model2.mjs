// Niche = indoor-plant care & accessories. Per-SKU margin + catalogue AOV (w/ bundles) + 3-scenario 3-month
// + 10k funnel. ASP = observed Amazon.fr prices (FACT-ish, dated). costEst = NON_VERIFIED (quote pending, ~40% ASP).
const F = { amazon:0.15, cotis:0.123, shipUnit:4.5 };
// SKU: {sku,name,asp(observed€),costEst,obs(observed monthly-purchase signal)}
const SKUS = [
 {sku:"PL-01",name:"Humidimètre sol 4-en-1",            asp:12.90, costEst:5.0, obs:"10K+/mo (moisture meter cat.)"},
 {sku:"PL-02",name:"Globes d'arrosage (x6)",            asp:12.90, costEst:5.2, obs:"3K+/mo (watering globes)"},
 {sku:"PL-03",name:"Pots self-watering (x2)",           asp:17.90, costEst:7.5, obs:"steady"},
 {sku:"PL-04",name:"Lampe horticole clip",              asp:27.90, costEst:12.0,obs:"grow-light demand"},
 {sku:"PL-05",name:"Cache-pot céramique + soucoupe",    asp:21.90, costEst:9.0, obs:"core category"},
 {sku:"PL-06",name:"Engrais plantes (abonnable)",       asp:8.90,  costEst:2.8, obs:"REPEAT purchase"},
 {sku:"PL-07",name:"Kit outils d'entretien",            asp:14.90, costEst:5.5, obs:"cross-sell"},
 {sku:"PL-08",name:"Tuteur mousse / moss pole",         asp:15.90, costEst:5.8, obs:"trending (monstera)"},
 {sku:"PL-09",name:"Étagère plantes 5 niveaux (hero)",  asp:34.90, costEst:16.0,obs:"#1 bestseller (Bamworld-type)"},
];
const r2=x=>Math.round(x*100)/100;
function contrib(s){ // contributive margin per unit sold (franchise: no VAT reclaim; cost is TTC)
  const cm = s.asp*(1-F.amazon-F.cotis) - s.costEst - F.shipUnit;
  return {sku:s.sku,name:s.name,asp:s.asp,costEst:s.costEst,cm:r2(cm),marginPct:r2(cm/s.asp*100),obs:s.obs};
}
const perSku = SKUS.map(contrib);
// Bundles raise AOV (free-ship threshold 49)
const bundles = [
 {name:"Kit Débutant (humidimètre+globes+engrais)", skus:["PL-01","PL-02","PL-06"]},
 {name:"Kit Nouvelle Plante (cache-pot+self-water+engrais)", skus:["PL-05","PL-03","PL-06"]},
 {name:"Pack Lumière (lampe+étagère)", skus:["PL-04","PL-09"]},
];
const byId=Object.fromEntries(SKUS.map(s=>[s.sku,s]));
const bundleCalc = bundles.map(b=>{const price=r2(b.skus.reduce((a,x)=>a+byId[x].asp,0));
  const cm=r2(b.skus.reduce((a,x)=>a+perSku.find(p=>p.sku===x).cm,0)+ (price>=49?F.shipUnit:0)); // save 1 ship if free-ship bundle vs separate
  return {name:b.name,price,cmApprox:cm};});
// Catalogue AOV: assume order mix ~ 55% single mid SKU (~€18) + 45% bundle (~€35) => AOV
const aov = r2(0.55*18 + 0.45*35);
const cmPerOrder = r2(aov*(1-F.amazon-F.cotis) - (aov*0.42) - F.shipUnit); // blended cost ~42% ASP
// 10k funnel (marketplace path, from prior feasibility)
const ordersFor10k = Math.ceil(10000/aov);
// 3-scenario 3-month (orders/month ramp)
const scen = {
 prudent:  [120,150,170],
 central:  [200,260,300],
 favorable:[330,380,420],
};
const months=(arr)=>arr.map((o,i)=>{const rev=r2(o*aov);const cm=r2(o*cmPerOrder);const fixed=84;
  return {month:i+1,orders:o,revenue:rev,contrib:cm,result:r2(cm-fixed)};});
const scenarios=Object.fromEntries(Object.entries(scen).map(([k,v])=>{const m=months(v);
  return [k,{months:m,q1Revenue:r2(m.reduce((a,x)=>a+x.revenue,0)),q1Result:r2(m.reduce((a,x)=>a+x.result,0))}];}));
// invariants
let ok=0,bad=0;const A=(n,c)=>{c?ok++:bad++;if(!c)console.log("FAIL "+n);};
A("all SKU CM computed", perSku.every(p=>typeof p.cm==="number"));
A("AOV positive", aov>0); A("cmPerOrder positive", cmPerOrder>0);
A("ordersFor10k = ceil(10000/aov)", ordersFor10k===Math.ceil(10000/aov));
console.log(JSON.stringify({perSku,bundleCalc,aov,cmPerOrder,ordersFor10k,
  month1_revenue_by_scenario:{prudent:scenarios.prudent.months[0].revenue,central:scenarios.central.months[0].revenue,favorable:scenarios.favorable.months[0].revenue},
  scenarios, invariants:`${ok} pass / ${bad} fail`},null,1));
