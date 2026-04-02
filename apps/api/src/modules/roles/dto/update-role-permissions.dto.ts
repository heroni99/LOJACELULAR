import { ArrayUnique, IsArray, IsIn } from "class-validator";
import { permissionKeys } from "@lojacelular/shared";

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(permissionKeys, { each: true })
  permissions!: string[];
}
