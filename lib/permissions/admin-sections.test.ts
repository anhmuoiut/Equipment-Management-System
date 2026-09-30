import { describe, expect, it } from 'vitest';
import {
  ADMIN_CATEGORIES, ADMIN_SECTION_PATHS, accessibleAdminCategories, adminCategoryOf, adminSectionAt,
  canAccessAdminSection, firstAdminSection, roleHasPermission, type AdminSection,
} from './index';

const ALL_SECTIONS = Object.keys(ADMIN_SECTION_PATHS) as AdminSection[];

describe('admin sections', () => {
  it('gives an admin every section', () => {
    for (const section of ALL_SECTIONS) {
      expect(canAccessAdminSection('admin', [], section)).toBe(true);
    }
    expect(firstAdminSection('admin', [])).toBe('users');
  });

  it('never delegates users, audit or errors below role=admin', () => {
    const everything = ['master_data.manage', 'field.manage', 'user.manage'];
    for (const section of ['users', 'audit', 'errors'] as const) {
      expect(canAccessAdminSection('user', everything, section)).toBe(false);
    }
  });

  it('lands a delegated manager on the section they were granted, not on Users', () => {
    expect(firstAdminSection('user', ['field.manage'])).toBe('fields');
    expect(firstAdminSection('user', ['master_data.manage', 'field.manage'])).toBe('masterData');
    expect(canAccessAdminSection('user', ['field.manage'], 'masterData')).toBe(false);
  });

  it('delegates calibration settings with master data — its PUT requires master_data.manage', () => {
    expect(canAccessAdminSection('user', ['master_data.manage'], 'calibrationSettings')).toBe(true);
    expect(canAccessAdminSection('user', ['field.manage'], 'calibrationSettings')).toBe(false);
  });

  it('gives a viewer or an ungranted user nothing', () => {
    expect(firstAdminSection('viewer', ['master_data.manage'])).toBeNull();
    expect(firstAdminSection('user', ['equipment.create'])).toBeNull();
  });
});

describe('admin categories (sidebar grouping)', () => {
  it('puts every section in exactly one category, in the same order /admin lands by', () => {
    const grouped = ADMIN_CATEGORIES.flatMap(({ sections }) => sections);
    expect(grouped).toEqual(ALL_SECTIONS);
    for (const section of ALL_SECTIONS) {
      expect(grouped.filter((s) => s === section)).toHaveLength(1);
    }
  });

  it('shows an admin all four categories: users, configuration, fields, logs', () => {
    expect(accessibleAdminCategories('admin', [])).toEqual([
      { category: 'users', sections: ['users'] },
      { category: 'configuration', sections: ['masterData', 'calibrationSettings'] },
      { category: 'fields', sections: ['fields'] },
      { category: 'logs', sections: ['audit', 'errors'] },
    ]);
  });

  it('leaves out categories a delegated manager has nothing in', () => {
    expect(accessibleAdminCategories('user', ['field.manage'])).toEqual([
      { category: 'fields', sections: ['fields'] },
    ]);
    expect(accessibleAdminCategories('user', ['master_data.manage'])).toEqual([
      { category: 'configuration', sections: ['masterData', 'calibrationSettings'] },
    ]);
    expect(accessibleAdminCategories('viewer', ['master_data.manage', 'field.manage'])).toEqual([]);
  });

  it('maps a pathname to its section and category', () => {
    expect(adminSectionAt('/admin/calibration-settings')).toBe('calibrationSettings');
    expect(adminSectionAt('/admin/audit')).toBe('audit');
    expect(adminSectionAt('/admin/users/some-id')).toBe('users');
    expect(adminSectionAt('/admin')).toBeNull();
    expect(adminSectionAt('/admin/users-archive')).toBeNull();
    expect(adminSectionAt('/equipment')).toBeNull();
    expect(adminCategoryOf('calibrationSettings')).toBe('configuration');
    expect(adminCategoryOf('errors')).toBe('logs');
  });
});

describe('roleHasPermission', () => {
  it('follows hasPermission: admin always, viewer only .view codes, user only granted codes', () => {
    expect(roleHasPermission('admin', [], 'calibration.view')).toBe(true);
    expect(roleHasPermission('viewer', [], 'calibration.view')).toBe(true);
    expect(roleHasPermission('viewer', ['calibration.create'], 'calibration.create')).toBe(false);
    expect(roleHasPermission('user', [], 'calibration.view')).toBe(false);
    expect(roleHasPermission('user', ['calibration.view'], 'calibration.view')).toBe(true);
  });
});
