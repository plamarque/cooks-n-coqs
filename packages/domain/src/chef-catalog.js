import Ajv2020 from "ajv/dist/2020.js";
const CHEF_CATALOG = Object.freeze({
  "catalogRevision": "chef-catalog-v1-db7a1a850d15e470",
  "skills": [
    {
      "id": "adapter-une-recette",
      "dependencies": [
        "chef-core"
      ],
      "summary": "Adapte une recette locale avec un extrait born\xE9.",
      "instructions": "Ne lire que l'extrait autoris\xE9 et pr\xE9parer une pr\xE9visualisation avant toute \xE9criture.",
      "toolIds": [
        "get-recipe-context",
        "prepare-preview"
      ]
    },
    {
      "id": "chef-core",
      "dependencies": [],
      "summary": "Orchestre un tour Chef sans \xE9criture implicite.",
      "instructions": "N'utiliser que les capacit\xE9s compil\xE9es et actives.",
      "toolIds": [
        "assistant-advice",
        "classify-turn",
        "search-notebook"
      ]
    }
  ],
  "tools": [
    {
      "id": "assistant-advice",
      "skillId": "chef-core",
      "executor": "bff",
      "effect": "bff_read",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "request"
        ],
        "properties": {
          "request": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2600
          }
        }
      },
      "resultSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "text"
        ],
        "properties": {
          "text": {
            "type": "string",
            "minLength": 1,
            "maxLength": 600
          }
        }
      }
    },
    {
      "id": "classify-turn",
      "skillId": "chef-core",
      "executor": "bff",
      "effect": "bff_read",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "message"
        ],
        "properties": {
          "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2600
          }
        }
      },
      "resultSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "intent",
          "constraints"
        ],
        "properties": {
          "intent": {
            "type": "string",
            "maxLength": 20
          },
          "constraints": {
            "type": "array",
            "maxItems": 12,
            "items": {
              "type": "string",
              "maxLength": 180
            }
          }
        }
      }
    },
    {
      "id": "get-recipe-context",
      "skillId": "adapter-une-recette",
      "executor": "local",
      "effect": "local_read",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "referenceTitle": {
            "type": "string",
            "maxLength": 180
          }
        }
      },
      "resultSchema": {
        "oneOf": [
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "recipe"
            ],
            "properties": {
              "recipe": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "title",
                  "ingredients",
                  "steps"
                ],
                "properties": {
                  "title": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 180
                  },
                  "ingredients": {
                    "type": "array",
                    "maxItems": 16,
                    "items": {
                      "type": "string",
                      "maxLength": 180
                    }
                  },
                  "steps": {
                    "type": "array",
                    "maxItems": 8,
                    "items": {
                      "type": "string",
                      "maxLength": 500
                    }
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "text"
            ],
            "properties": {
              "text": {
                "type": "string",
                "minLength": 1,
                "maxLength": 600
              }
            }
          }
        ]
      }
    },
    {
      "id": "prepare-preview",
      "skillId": "adapter-une-recette",
      "executor": "local",
      "effect": "preview_then_confirm",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "request"
        ],
        "properties": {
          "request": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2600
          }
        }
      },
      "resultSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "prepared"
        ],
        "properties": {
          "prepared": {
            "const": true
          }
        }
      }
    },
    {
      "id": "search-notebook",
      "skillId": "chef-core",
      "executor": "local",
      "effect": "local_read",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "query"
        ],
        "properties": {
          "query": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2600
          }
        }
      },
      "resultSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "titles"
        ],
        "properties": {
          "titles": {
            "type": "array",
            "maxItems": 3,
            "items": {
              "type": "string",
              "maxLength": 180
            }
          }
        }
      }
    }
  ]
});
const CHEF_CATALOG_REVISION = CHEF_CATALOG.catalogRevision;
function resolveChefSkillClosure(skillIds) {
  const byId = new Map(CHEF_CATALOG.skills.map((skill) => [skill.id, skill]));
  const active = /* @__PURE__ */ new Set();
  const visit = (id) => {
    const skill = byId.get(id);
    if (!skill) return false;
    if (active.has(id)) return true;
    active.add(id);
    return skill.dependencies.every(visit);
  };
  return skillIds.every(visit) ? CHEF_CATALOG.skills.map(({ id }) => id).filter((id) => active.has(id)) : null;
}
function chefCatalogToolsForSkills(skillIds) {
  const closure = resolveChefSkillClosure(skillIds);
  return closure ? CHEF_CATALOG.tools.filter((tool) => closure.includes(tool.skillId)).map((tool) => tool.id) : null;
}
const forbiddenChefData = /(?:blob:|data:|\b(?:indexeddb|dexie|file|blob|profile|cahier|prompt|reasoning)\b)/iu;
const forbiddenChefKey = /(?:^|[_-])(?:id|file|blob|binary|profile|cahier|prompt|reasoning)(?:$|[_-])/iu;
function isChefCatalogSafeJson(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return typeof value !== "string" || !forbiddenChefData.test(value);
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Array.isArray(value) ? value.every((entry) => isChefCatalogSafeJson(entry, seen)) : Object.entries(value).every(([key, entry]) => !forbiddenChefKey.test(key) && isChefCatalogSafeJson(entry, seen));
}
const validatesSchema = (schema, value) => {
  if (!isChefCatalogSafeJson(value)) return false;
  if ("const" in schema && value !== schema.const) return false;
  if (schema.type === "string") return typeof value === "string" && (typeof schema.minLength !== "number" || value.length >= schema.minLength) && (typeof schema.maxLength !== "number" || value.length <= schema.maxLength);
  if (schema.type === "array") return Array.isArray(value) && (typeof schema.maxItems !== "number" || value.length <= schema.maxItems) && (typeof schema.minItems !== "number" || value.length >= schema.minItems) && (!schema.items || value.every((entry) => validatesSchema(schema.items, entry)));
  if (schema.type !== "object" || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value;
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false && Object.keys(object).some((key) => !(key in properties))) return false;
  if (Array.isArray(schema.required) && schema.required.some((key) => typeof key !== "string" || !(key in object))) return false;
  return Object.entries(object).every(([key, entry]) => !(key in properties) || validatesSchema(properties[key], entry));
};
const chefCatalogAjv = new Ajv2020({ strict: true });
function validateChefCatalogToolValue(toolId, direction, value) {
  const tool = CHEF_CATALOG.tools.find((candidate) => candidate.id === toolId);
  const schema = tool && (direction === "input" ? tool.inputSchema : tool.resultSchema);
  return !!schema && isChefCatalogSafeJson(value) && chefCatalogAjv.compile(schema)(value);
}
export {
  CHEF_CATALOG,
  CHEF_CATALOG_REVISION,
  chefCatalogToolsForSkills,
  isChefCatalogSafeJson,
  resolveChefSkillClosure,
  validateChefCatalogToolValue
};
