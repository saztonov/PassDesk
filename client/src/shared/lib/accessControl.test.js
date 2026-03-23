import { describe, expect, it } from "vitest";
import {
  canAccessOt,
  canAccessSkud,
  canManageAdministrativeData,
  canManageCounterparties,
  canManageEmployeeStatuses,
  canManageUsers,
} from "./accessControl";

describe("accessControl", () => {
  it("allows employee status management for admin and manager only", () => {
    expect(canManageEmployeeStatuses("admin")).toBe(true);
    expect(canManageEmployeeStatuses("manager")).toBe(true);
    expect(canManageEmployeeStatuses("user")).toBe(false);
  });

  it("allows admin and manager to manage administrative data", () => {
    expect(canManageAdministrativeData("admin")).toBe(true);
    expect(canManageAdministrativeData("manager")).toBe(true);
    expect(canManageAdministrativeData("user")).toBe(false);
  });

  it("allows admin and manager to manage users", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("manager")).toBe(true);
    expect(canManageUsers("user")).toBe(false);
  });

  it("allows manager and eligible user to manage counterparties", () => {
    expect(
      canManageCounterparties({
        role: "manager",
      }),
    ).toBe(true);
    expect(
      canManageCounterparties({
        role: "user",
        counterpartyId: "user-counterparty",
        defaultCounterpartyId: "default-counterparty",
      }),
    ).toBe(true);
    expect(
      canManageCounterparties({
        role: "user",
        counterpartyId: "default-counterparty",
        defaultCounterpartyId: "default-counterparty",
      }),
    ).toBe(false);
  });

  it("allows SKUD access only for admin", () => {
    expect(canAccessSkud("admin")).toBe(true);
    expect(canAccessSkud("manager")).toBe(false);
    expect(canAccessSkud("user")).toBe(false);
  });

  it("hides OT for manager and default-counterparty user", () => {
    expect(
      canAccessOt({
        role: "manager",
        isDefaultCounterpartyUser: false,
      }),
    ).toBe(false);
    expect(
      canAccessOt({
        role: "user",
        isDefaultCounterpartyUser: true,
      }),
    ).toBe(false);
  });

  it("allows OT for admin, OT roles and non-default users", () => {
    expect(
      canAccessOt({
        role: "admin",
      }),
    ).toBe(true);
    expect(
      canAccessOt({
        role: "ot_admin",
        isOtAdmin: true,
      }),
    ).toBe(true);
    expect(
      canAccessOt({
        role: "ot_engineer",
        isOtEngineer: true,
      }),
    ).toBe(true);
    expect(
      canAccessOt({
        role: "user",
        isDefaultCounterpartyUser: false,
      }),
    ).toBe(true);
  });
});
