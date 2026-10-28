package com.farmacorp.inventory.persistence;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class InventoryRepository {
  private final JdbcTemplate jdbc;

  public InventoryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void execute(String sql) {
    jdbc.execute(sql);
  }

  public int update(String sql, Object... args) {
    return jdbc.update(sql, args);
  }

  public List<Map<String, Object>> queryForList(String sql, Object... args) {
    return jdbc.queryForList(sql, args);
  }

  public <T> List<T> queryForList(String sql, Class<T> type, Object... args) {
    return jdbc.queryForList(sql, type, args);
  }

  public <T> T queryForObject(String sql, Class<T> type, Object... args) {
    return jdbc.queryForObject(sql, type, args);
  }

  public <T> List<T> query(String sql, RowMapper<T> mapper, Object... args) {
    return jdbc.query(sql, mapper, args);
  }

  public <T> T query(String sql, ResultSetExtractor<T> extractor, Object... args) {
    return jdbc.query(sql, extractor, args);
  }

  public void query(String sql, RowCallbackHandler handler, Object... args) {
    jdbc.query(sql, handler, args);
  }
}
