import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { Topic } from "../api/types.js";
import { Spinner } from "./ui.js";

interface TopicPickerProps {
  assemblyId: string;
  value: string[];
  onChange: (topicIds: string[]) => void;
  disabled?: boolean;
  /** Topic IDs to highlight with an expertise badge (e.g., candidate declared topics). */
  highlightTopics?: string[];
}

/** Build a tree from flat topic list: roots first, children nested under parent. */
function buildTree(topics: Topic[]): Array<{ topic: Topic; children: Topic[] }> {
  const childMap = new Map<string | null, Topic[]>();
  for (const t of topics) {
    const key = t.parentId ?? "__root__";
    const siblings = childMap.get(key) ?? [];
    siblings.push(t);
    childMap.set(key, siblings);
  }

  const roots = (childMap.get("__root__") ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  return roots.map((root) => ({
    topic: root,
    children: (childMap.get(root.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function TopicPicker({ assemblyId, value, onChange, disabled, highlightTopics }: TopicPickerProps) {
  const { data, loading } = useApi(() => api.listTopics(assemblyId), [assemblyId]);

  if (loading) return <Spinner />;

  const topics = data?.topics ?? [];
  if (topics.length === 0) {
    return <p className="text-sm text-text-tertiary">No topics defined for this assembly.</p>;
  }

  const selected = new Set(value);

  const toggle = (id: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange([...next]);
  };

  const tree = buildTree(topics);

  const highlighted = new Set(highlightTopics ?? []);

  return (
    <div className="space-y-1">
      {tree.map(({ topic, children }) => (
        <div key={topic.id}>
          <TopicCheckbox
            topic={topic}
            checked={selected.has(topic.id)}
            onToggle={toggle}
            disabled={disabled}
            highlighted={highlighted.has(topic.id)}
            isRoot
          />
          {children.length > 0 && (
            <div className="ml-5 space-y-0.5">
              {children.map((child) => (
                <TopicCheckbox
                  key={child.id}
                  topic={child}
                  checked={selected.has(child.id)}
                  onToggle={toggle}
                  disabled={disabled}
                  highlighted={highlighted.has(child.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TopicCheckbox({
  topic,
  checked,
  onToggle,
  disabled,
  isRoot,
  highlighted,
}: {
  topic: Topic;
  checked: boolean;
  onToggle: (id: string) => void;
  disabled?: boolean;
  isRoot?: boolean;
  highlighted?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-interactive-hover ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(topic.id)}
        disabled={disabled}
        className="rounded border-border-strong text-accent focus:ring-focus-ring"
      />
      <span className={`text-sm flex-1 ${isRoot ? "font-medium text-text-primary" : "text-text-secondary"}`}>
        {topic.name}
      </span>
      {highlighted && (
        <span className="text-[10px] font-medium text-info-text bg-info-subtle px-1.5 py-0.5 rounded border border-info-border shrink-0">
          Expertise
        </span>
      )}
    </label>
  );
}
