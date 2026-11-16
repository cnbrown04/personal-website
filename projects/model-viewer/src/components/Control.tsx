import type { ParamHint } from "../hints";
import type { Param, ParamValue } from "../types";

interface Props {
  param: Param;
  value: ParamValue;
  hint?: ParamHint;
  onChange: (value: ParamValue) => void;
  onReset: () => void;
}

export function Control({ param, value, hint, onChange, onReset }: Props) {
  const modified = JSON.stringify(value) !== JSON.stringify(param.default);
  const off = hint?.off ?? false;

  return (
    <div className={`control ${modified ? "modified" : ""} ${off ? "inactive" : ""}`}>
      <div className="control-head">
        <label htmlFor={`p-${param.name}`} title={`line ${param.line}`}>
          {param.name}
        </label>
        {modified && (
          <button type="button" className="reset" onClick={onReset} title="Back to file default">
            ↺
          </button>
        )}
      </div>
      {param.description && <p className="desc">{param.description}</p>}
      {hint && <p className={off ? "hint" : "hint note"}>{hint.reason}</p>}
      {/* A disabled fieldset disables every input inside it. */}
      <fieldset className="widget" disabled={off}>
        <Widget param={param} value={value} onChange={onChange} />
      </fieldset>
    </div>
  );
}

function Widget({ param, value, onChange }: Omit<Props, "onReset">) {
  const id = `p-${param.name}`;

  if (param.options && param.options.length > 0) {
    return (
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const picked = param.options!.find((o) => String(o.value) === e.target.value);
          onChange(picked ? picked.value : e.target.value);
        }}
      >
        {param.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  switch (param.kind) {
    case "bool":
      return (
        <label className="switch">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{value ? "on" : "off"}</span>
        </label>
      );

    case "number": {
      const num = Number(value);
      const hasRange = param.min !== undefined && param.max !== undefined;
      const step = param.step ?? (Number.isInteger(param.default as number) ? 1 : 0.1);
      return (
        <div className="number-row">
          {hasRange && (
            <input
              id={id}
              type="range"
              min={param.min}
              max={param.max}
              step={step}
              value={Number.isFinite(num) ? num : 0}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          )}
          <input
            className="number-box"
            type="number"
            id={hasRange ? undefined : id}
            min={param.min}
            max={param.max}
            step={step}
            value={Number.isFinite(num) ? num : 0}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) onChange(next);
            }}
          />
        </div>
      );
    }

    case "vector": {
      const items = Array.isArray(value) ? value : [];
      return (
        <div className="vector-row">
          {items.map((item, i) => (
            <input
              key={i}
              type="number"
              value={Number(item)}
              onChange={(e) => {
                const next = [...items];
                next[i] = Number(e.target.value);
                onChange(next);
              }}
            />
          ))}
        </div>
      );
    }

    default:
      return (
        <input
          id={id}
          type="text"
          maxLength={param.max_length}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
