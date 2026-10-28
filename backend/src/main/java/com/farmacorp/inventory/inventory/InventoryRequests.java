package com.farmacorp.inventory.inventory;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public final class InventoryRequests {
  private InventoryRequests() {}

  public record Product(
      @NotBlank String name,
      @NotBlank String sku,
      @NotBlank String unit,
      @NotBlank String category,
      @NotNull @DecimalMin("0") BigDecimal price,
      @NotNull @DecimalMin("0") BigDecimal threshold,
      @NotNull @DecimalMin("0") BigDecimal replenishment,
      @NotNull Boolean lotTracked) {}

  public record Location(@NotBlank String name, String newName) {}

  public record Lot(
      @NotBlank String productId,
      @NotBlank String location,
      @NotBlank String id,
      @NotNull Boolean blocked,
      String note) {}

  public record Settings(@NotNull @Min(0) @Max(3650) Integer alertDays) {}

  public record Review(@NotBlank String productId, @NotBlank String location) {}

  public record Command(
      @NotBlank String type,
      String productId,
      String location,
      BigDecimal amount,
      String lotId,
      String expiry,
      String reference,
      String saleId,
      String origin,
      String destination,
      String id,
      BigDecimal physical,
      String reason) {}
}
