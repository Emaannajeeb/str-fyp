/**
 * Database seeding script
 * Run with: pnpm prisma db seed
 * or: pnpm tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data (optional - comment out in production)
  // await prisma.auditLog.deleteMany();
  // await prisma.notification.deleteMany();
  // await prisma.stream.deleteMany();
  // await prisma.contract.deleteMany();
  // await prisma.employee.deleteMany();
  // await prisma.departmentBudget.deleteMany();
  // await prisma.departmentMember.deleteMany();
  // await prisma.department.deleteMany();
  // await prisma.budget.deleteMany();
  // await prisma.userRole.deleteMany();
  // await prisma.wallet.deleteMany();
  // await prisma.approval.deleteMany();
  // await prisma.rolePermission.deleteMany();
  // await prisma.permission.deleteMany();
  // await prisma.role.deleteMany();
  // await prisma.user.deleteMany();
  // await prisma.organization.deleteMany();

  // 1. Create Demo Organization
  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-corp' },
    update: {},
    create: {
      name: 'Demo Corporation',
      slug: 'demo-corp',
    },
  });
  console.log('✅ Created organization:', organization.name);

  // 2. Create Roles
  const roles = [
    { key: 'SYS_ADMIN', label: 'System Administrator' },
    { key: 'FINANCE_ADMIN', label: 'Finance Administrator' },
    { key: 'MANAGER', label: 'Manager' },
    { key: 'HR', label: 'Human Resources' },
    { key: 'EMPLOYEE', label: 'Employee' },
    { key: 'AUDITOR', label: 'Auditor' },
  ];

  const createdRoles = await Promise.all(
    roles.map((role) =>
      prisma.role.upsert({
        where: { key: role.key },
        update: {},
        create: role,
      })
    )
  );
  console.log('✅ Created roles:', createdRoles.map((r: { key: string }) => r.key).join(', '));

  // 3. Create Permissions
  const permissions = [
    // Stream permissions
    { key: 'CREATE_STREAM', label: 'Create Stream' },
    { key: 'PAUSE_STREAM', label: 'Pause Stream' },
    { key: 'CANCEL_STREAM', label: 'Cancel Stream' },
    { key: 'FUND_STREAM', label: 'Fund Stream' },
    // Payroll permissions
    { key: 'APPROVE_PAYROLL', label: 'Approve Payroll' },
    // Employee management
    { key: 'MANAGE_EMPLOYEES', label: 'Manage Employees' },
    // Audit and viewing permissions
    { key: 'VIEW_AUDIT', label: 'View Audit' },
    { key: 'VIEW_FINANCE_DASHBOARD', label: 'View Finance Dashboard' },
    { key: 'VIEW_SELF_STREAMS', label: 'View Self Streams' },
    // Legacy permissions (kept for backward compatibility)
    { key: 'CREATE_CONTRACT', label: 'Create Contract' },
    { key: 'EDIT_CONTRACT', label: 'Edit Contract' },
    { key: 'DELETE_CONTRACT', label: 'Delete Contract' },
    { key: 'APPROVE_PAYMENT', label: 'Approve Payment' },
    { key: 'VIEW_BUDGET', label: 'View Budget' },
    { key: 'MANAGE_BUDGET', label: 'Manage Budget' },
    { key: 'VIEW_AUDIT_LOG', label: 'View Audit Log' },
    { key: 'MANAGE_ROLES', label: 'Manage Roles' },
  ];

  const createdPermissions = await Promise.all(
    permissions.map((permission) =>
      prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      })
    )
  );
  console.log('✅ Created permissions:', createdPermissions.length);

  // 4. Map Permissions to Roles
  const rolePermissionMap: Record<string, string[]> = {
    // SYS_ADMIN has ALL permissions
    SYS_ADMIN: [
      // Stream permissions
      'FUND_STREAM',
      'CREATE_STREAM',
      'PAUSE_STREAM',
      'CANCEL_STREAM',
      // Payroll permissions
      'APPROVE_PAYROLL',
      // Employee management
      'MANAGE_EMPLOYEES',
      // Audit and viewing permissions
      'VIEW_AUDIT',
      'VIEW_FINANCE_DASHBOARD',
      'VIEW_SELF_STREAMS',
      // Contract permissions
      'CREATE_CONTRACT',
      'EDIT_CONTRACT',
      'DELETE_CONTRACT',
      'APPROVE_PAYMENT',
      // Budget permissions
      'VIEW_BUDGET',
      'MANAGE_BUDGET',
      // Audit log
      'VIEW_AUDIT_LOG',
      // Role management
      'MANAGE_ROLES',
    ],
    FINANCE_ADMIN: [
      'FUND_STREAM',
      'CREATE_STREAM',
      'PAUSE_STREAM',
      'CANCEL_STREAM',
      'APPROVE_PAYROLL',
      'VIEW_FINANCE_DASHBOARD',
      'VIEW_AUDIT',
      // Legacy permissions
      'CREATE_CONTRACT',
      'EDIT_CONTRACT',
      'DELETE_CONTRACT',
      'APPROVE_PAYMENT',
      'VIEW_BUDGET',
      'MANAGE_BUDGET',
      'VIEW_AUDIT_LOG',
      'MANAGE_EMPLOYEES',
    ],
    MANAGER: [
      'APPROVE_PAYROLL',
      'VIEW_FINANCE_DASHBOARD',
      // Legacy permissions
      'CREATE_CONTRACT',
      'EDIT_CONTRACT',
      'CREATE_STREAM',
      'APPROVE_PAYMENT',
      'VIEW_BUDGET',
      'MANAGE_BUDGET', // Managers can create and manage budgets
      'VIEW_AUDIT_LOG',
      'MANAGE_EMPLOYEES',
    ],
    HR: [
      'MANAGE_EMPLOYEES',
      'VIEW_FINANCE_DASHBOARD',
      // Legacy permissions
      'VIEW_BUDGET',
      'VIEW_AUDIT_LOG',
    ],
    EMPLOYEE: ['VIEW_SELF_STREAMS'],
    AUDITOR: [
      'VIEW_AUDIT',
      'VIEW_FINANCE_DASHBOARD',
      // Legacy permissions
      'VIEW_AUDIT_LOG',
      'VIEW_BUDGET',
    ],
  };

  for (const [roleKey, permissionKeys] of Object.entries(rolePermissionMap)) {
    const role = createdRoles.find((r: { key: string }) => r.key === roleKey);
    if (!role) continue;

    const desiredPermissionIds = permissionKeys
      .map((key) => createdPermissions.find((p: { key: string }) => p.key === key)?.id)
      .filter((id): id is string => id !== undefined);

    if (desiredPermissionIds.length === 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id },
      });
    } else {
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: { notIn: desiredPermissionIds },
        },
      });
    }

    for (const permissionKey of permissionKeys) {
      const permission = createdPermissions.find((p: { key: string }) => p.key === permissionKey);
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
  console.log('✅ Mapped permissions to roles');

  // 5. Create System Admin User
  const sysAdmin = await prisma.user.upsert({
    where: { email: 'sysadmin@demo-corp.com' },
    update: {},
    create: {
      email: 'sysadmin@demo-corp.com',
      name: 'System Administrator',
      lastLoginAt: new Date(),
    },
  });
  console.log('✅ Created system admin user:', sysAdmin.email);

  // 6. Remove any existing EMPLOYEE role from sysadmin and assign SYS_ADMIN role
  const employeeRole = createdRoles.find((r: { key: string }) => r.key === 'EMPLOYEE');
  if (employeeRole) {
    // Delete EMPLOYEE role if it exists
    await prisma.userRole.deleteMany({
      where: {
        userId: sysAdmin.id,
        organizationId: organization.id,
        roleId: employeeRole.id,
      },
    });
  }

  const sysAdminRole = createdRoles.find((r: { key: string }) => r.key === 'SYS_ADMIN');
  if (sysAdminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_organizationId_roleId: {
          userId: sysAdmin.id,
          organizationId: organization.id,
          roleId: sysAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: sysAdmin.id,
        organizationId: organization.id,
        roleId: sysAdminRole.id,
      },
    });
    console.log('✅ Assigned SYS_ADMIN role to system admin');
  }

  // 7. Create Finance Admin User
  const financeAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo-corp.com' },
    update: {},
    create: {
      email: 'admin@demo-corp.com',
      name: 'Finance Administrator',
      lastLoginAt: new Date(),
    },
  });
  console.log('✅ Created finance admin user:', financeAdmin.email);

  // 8. Assign FINANCE_ADMIN role to user (ensure it's assigned even if user exists)
  const financeAdminRole = createdRoles.find((r: { key: string }) => r.key === 'FINANCE_ADMIN');
  if (financeAdminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_organizationId_roleId: {
          userId: financeAdmin.id,
          organizationId: organization.id,
          roleId: financeAdminRole.id,
        },
      },
      update: {}, // This ensures the role is assigned even if user already exists
      create: {
        userId: financeAdmin.id,
        organizationId: organization.id,
        roleId: financeAdminRole.id,
      },
    });
    console.log('✅ Assigned FINANCE_ADMIN role to finance admin');
  }

  // 9. Create Sample Employee
  const employee = await prisma.employee.create({
    data: {
      organizationId: organization.id,
      userId: financeAdmin.id, // Link to finance admin for demo
      displayName: 'John Doe',
      status: 'ACTIVE',
      startDate: new Date('2024-01-01'),
    },
  });
  console.log('✅ Created sample employee:', employee.displayName);

  // 10. Create Sample Contract
  const contract = await prisma.contract.create({
    data: {
      employeeId: employee.id,
      organizationId: organization.id,
      tokenMint: 'So11111111111111111111111111111111111111112', // SOL mint address
      tokenSymbol: 'SOL',
      rateType: 'SALARY',
      amountPerPeriod: 5000.0, // 5000 SOL per period
      period: 'MONTHLY',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      notes: 'Monthly salary contract for John Doe',
      active: true,
    },
  });
  console.log('✅ Created sample contract:', contract.id);

  // 11. Create Sample Budget
  const budget = await prisma.budget.create({
    data: {
      organizationId: organization.id,
      name: 'Q1 2024 Payroll Budget',
      tokenMint: 'So11111111111111111111111111111111111111112',
      tokenSymbol: 'SOL',
      capAmount: 100000.0, // 100k SOL
      currentCommitted: 5000.0, // 5k SOL committed (the contract)
    },
  });
  console.log('✅ Created sample budget:', budget.name);

  // 12. Create Sample Department
  const department = await prisma.department.create({
    data: {
      organizationId: organization.id,
      name: 'Engineering',
    },
  });
  console.log('✅ Created sample department:', department.name);

  // 13. Link Department to Budget
  await prisma.departmentBudget.create({
    data: {
      departmentId: department.id,
      budgetId: budget.id,
    },
  });
  console.log('✅ Linked department to budget');

  // 14. Add Employee to Department
  await prisma.departmentMember.create({
    data: {
      departmentId: department.id,
      userId: financeAdmin.id,
    },
  });
  console.log('✅ Added employee to department');

  // 15. List all users for summary
  const allUsers = await prisma.user.findMany({
    include: {
      userRoles: {
        include: {
          role: true,
          organization: true,
        },
      },
    },
  });

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nSummary:');
  console.log(`- Organization: ${organization.name} (${organization.slug})`);
  console.log(`- Roles: ${createdRoles.length}`);
  console.log(`- Permissions: ${createdPermissions.length}`);
  console.log(`\n📋 Users created:`);
  allUsers.forEach((user) => {
    const roles = user.userRoles.map((ur) => `${ur.role.key}@${ur.organization.slug}`).join(', ');
    console.log(`  - ${user.email} (${user.name || 'No name'}) [${roles || 'No roles'}]`);
  });
  console.log(`\n- System Admin: ${sysAdmin.email} (SYS_ADMIN - Full Control)`);
  console.log(`- Finance Admin: ${financeAdmin.email} (FINANCE_ADMIN - Can manage budgets)`);
  console.log(`- Employee: ${employee.displayName}`);
  console.log(`- Contract: ${contract.tokenSymbol} ${contract.amountPerPeriod}/${contract.period}`);
  console.log(`- Budget: ${budget.name} (${budget.capAmount} ${budget.tokenSymbol})`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
