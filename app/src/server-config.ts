export function reportsEphemeral(value:unknown){return !!value&&typeof value==='object'&&'ephemeral'in value&&value.ephemeral===true;}
