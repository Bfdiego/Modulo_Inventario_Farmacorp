package com.farmacorp.inventory.inventory;

import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class InventoryErrors {
  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Map<String, String>> status(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode())
        .body(Map.of("message", e.getReason() == null ? "Error de solicitud." : e.getReason()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
    var field = e.getBindingResult().getFieldError();
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "message",
                field == null ? "Datos inválidos." : "Campo inválido: " + field.getField()));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Map<String, String>> json(HttpMessageNotReadableException e) {
    return ResponseEntity.badRequest().body(Map.of("message", "JSON o tipo de dato inválido."));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<Map<String, String>> conflict(DataIntegrityViolationException e) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(Map.of("message", "La operación entra en conflicto con datos existentes."));
  }

  @ExceptionHandler(org.springframework.dao.DataAccessException.class)
  public ResponseEntity<Map<String, String>> unavailable(
      org.springframework.dao.DataAccessException e) {
    org.slf4j.LoggerFactory.getLogger(InventoryErrors.class).error("Database operation failed", e);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .body(
            Map.of(
                "message",
                "No se pudo acceder a la base de datos. Reintente la consulta antes de repetir una"
                    + " operación."));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, String>> unexpected(Exception e) {
    org.slf4j.LoggerFactory.getLogger(InventoryErrors.class).error("Unexpected API failure", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(
            Map.of(
                "message", "Error interno del servidor. Consulte los registros de la aplicación."));
  }
}
