import { describe, expect, it } from 'vitest';
import type { ContextNode } from './api';
import { buildEquipmentHierarchy } from './equipment-hierarchy';

function node(id: string, parent_id: string | null, depth: number): ContextNode {
  return { id, parent_id, depth, serial_number: id, part_number: null, type_id: 'type-fixture', level_id: null, status_id: 'status-active', current_location_id: 'location', archived_at: null };
}

describe('equipment hierarchy', () => {
  it('connects root, parent and selected equipment in their real order', () => {
    const tree = buildEquipmentHierarchy(node('selected', 'parent', 0), [node('parent', 'root', 1), node('root', null, 2)], []);
    expect(tree.equipment.id).toBe('root');
    expect(tree.relation).toBe('root');
    expect(tree.children[0]?.equipment.id).toBe('parent');
    expect(tree.children[0]?.children[0]?.equipment.id).toBe('selected');
    expect(tree.children[0]?.children[0]?.relation).toBe('current');
  });
  it('keeps grandchildren under the correct siblings even when API rows are out of order', () => {
    const tree = buildEquipmentHierarchy(node('selected', null, 0), [], [
      node('grandchild-b', 'child-b', 2), node('child-b', 'selected', 1),
      node('grandchild-a', 'child-a', 2), node('child-a', 'selected', 1),
    ]);
    expect(tree.children.map((child) => child.equipment.id)).toEqual(['child-a', 'child-b']);
    expect(tree.children[0]?.children[0]?.equipment.id).toBe('grandchild-a');
    expect(tree.children[1]?.children[0]?.equipment.id).toBe('grandchild-b');
    expect(tree.children[1]?.children[0]?.relation).toBe('descendant');
  });
  it('retains archived relatives and their descendants', () => {
    const archived = { ...node('archived', 'selected', 1), archived_at: '2026-09-19T00:00:00Z' };
    const tree = buildEquipmentHierarchy(node('selected', null, 0), [], [archived, node('child', 'archived', 2)]);
    expect(tree.children[0]?.equipment.archived_at).toBe(archived.archived_at);
    expect(tree.children[0]?.children[0]?.equipment.id).toBe('child');
  });
  it('shows standalone equipment without inventing connections', () => {
    const tree = buildEquipmentHierarchy(node('selected', null, 0), [], []);
    expect(tree.relation).toBe('current');
    expect(tree.children).toEqual([]);
  });
  it('does not repeat the selected equipment if malformed input contains a cycle', () => {
    const tree = buildEquipmentHierarchy(node('selected', null, 0), [], [node('child', 'selected', 1), node('selected', 'child', 2)]);
    expect(tree.children[0]?.children).toEqual([]);
  });
});
