import type { ContextNode } from './api';

export type HierarchyEquipment = Pick<ContextNode,
  'id' | 'serial_number' | 'part_number' | 'type_id' | 'current_location_id'
> & Partial<Pick<ContextNode, 'status_id' | 'archived_at'>>;

export type EquipmentBranch = {
  equipment: HierarchyEquipment;
  relation: 'root' | 'parent' | 'current' | 'child' | 'descendant';
  children: EquipmentBranch[];
};

/** Group by parent ID: the context API returns breadth-first rows, not tree order. */
export function buildEquipmentHierarchy(
  current: HierarchyEquipment, ancestors: ContextNode[], descendants: ContextNode[],
): EquipmentBranch {
  const childrenByParent = new Map<string, ContextNode[]>();
  for (const node of descendants) {
    if (!node.parent_id) continue;
    const siblings = childrenByParent.get(node.parent_id) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parent_id, siblings);
  }
  const visited = new Set([current.id]);
  function childrenOf(id: string, depth: number): EquipmentBranch[] {
    return [...(childrenByParent.get(id) ?? [])]
      .sort((a, b) => a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true }))
      .flatMap((node): EquipmentBranch[] => {
        if (visited.has(node.id)) return [];
        visited.add(node.id);
        return [{ equipment: node, relation: depth === 1 ? 'child' : 'descendant', children: childrenOf(node.id, depth + 1) }];
      });
  }
  let tree: EquipmentBranch = { equipment: current, relation: 'current', children: childrenOf(current.id, 1) };
  const chain = [...ancestors].sort((a, b) => a.depth - b.depth);
  chain.forEach((node, index) => {
    tree = { equipment: node, relation: index === chain.length - 1 ? 'root' : 'parent', children: [tree] };
  });
  return tree;
}
