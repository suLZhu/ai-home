// Gemini's OpenAI-compatible adapters can reject full MCP JSON Schema keywords.
// Convert only the outbound tool declarations; never modify the stored MCP schema.
const SIMPLE_KEYS = new Set(['type','description','title','properties','required','items','enum','format','minimum','maximum','minLength','maxLength','minItems','maxItems','nullable']);
export function sanitizeGeminiToolSchema(schema, root = schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { type: 'object', properties: {} };
  if (seen.has(schema)) return { type: 'object', properties: {} };
  const expanded = typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')
    ? schema.$ref.slice(2).split('/').reduce((acc,part)=>acc?.[part.replace(/~1/g,'/').replace(/~0/g,'~')],root)
    : null;
  if (expanded && expanded !== schema) return sanitizeGeminiToolSchema(expanded,root,new Set([...seen,schema]));
  const nextSeen = new Set([...seen,schema]);
  const out = {};
  for (const [key,value] of Object.entries(schema)) {
    if (!SIMPLE_KEYS.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      // Property names are arbitrary user-defined keys, not schema keywords.
      out.properties = Object.fromEntries(Object.entries(value).map(([name,item]) => [name,sanitizeGeminiToolSchema(item,root,nextSeen)]));
    } else if (key === 'items' && value && typeof value === 'object') {
      out.items = sanitizeGeminiToolSchema(value,root,nextSeen);
    } else if (key === 'type') {
      if (typeof value === 'string') out.type = value;
      else if (Array.isArray(value)) {
        out.type = value.find(item=>typeof item==='string'&&item!=='null')||'string';
        if (value.includes('null')) out.nullable = true;
      }
    } else if (key === 'required' && Array.isArray(value)) {
      out.required = value.filter(item=>typeof item==='string');
    } else if (key === 'enum' && Array.isArray(value)) {
      out.enum = value.filter(item=>typeof item==='string'||typeof item==='number'||typeof item==='boolean');
    } else if (typeof value === 'string'||typeof value === 'number'||typeof value === 'boolean') out[key] = value;
  }
  if (!out.type) out.type = out.properties ? 'object' : 'string';
  if (out.type==='object'&&!out.properties) out.properties={};
  return out;
}
export function sanitizeGeminiTools(tools) {
  return (Array.isArray(tools)?tools:[]).map(tool=>
    tool?.type==='function'&&tool.function?.parameters
      ? {...tool,function:{...tool.function,parameters:sanitizeGeminiToolSchema(tool.function.parameters)}}
      : tool
  );
}
