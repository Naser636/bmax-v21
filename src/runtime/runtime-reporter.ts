export class RuntimeReporter{
report(input:unknown){
return{
generatedAt:new Date().toISOString(),
result:input
};
}
}
