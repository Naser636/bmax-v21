function canonicalJson(value: any): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return JSON.stringify(value);
    } else if (Array.isArray(value)) {
        return '[' + value.map(canonicalJson).join(',') + ']';
    } else if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const entries = keys.map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]));
        return '{' + entries.join(',') + '}';
    }
    return JSON.stringify(value);
}

module.exports = { canonicalJson };
export {};