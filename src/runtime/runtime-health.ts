export class RuntimeHealth{
check(){
return{
status:"HEALTHY",
timestamp:new Date().toISOString()
};
}
}
