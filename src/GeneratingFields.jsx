import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { utils, writeFile } from 'xlsx';

const GeneratingFields = () => {
  const { state } = useLocation();
  const { fullData } = state || {};

  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueFields, setValueFields] = useState([]);
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [aggregationType, setAggregationType] = useState("Sum");
  const pivotTableRef = useRef(null);

  if (!fullData || fullData.length < 2) {
    return <div>No data received</div>;
  }

  // Extract headers and structured rows
  const [headers, ...rows] = fullData;
  const structuredData = rows.map((row) =>
    headers.reduce((acc, key, idx) => {
      acc[key] = row[idx];
      return acc;
    }, {})
  );

  const addField = (setFieldFn, currentFields, field) => {
    if (field && !currentFields.includes(field)) {
      setFieldFn([...currentFields, field]);
    }
  };

  const removeField = (field, setFieldFn, currentFields) => {
    setFieldFn(currentFields.filter((f) => f !== field));
    // Reset the corresponding 'selected' state
    if (setFieldFn === setRowFields) {
      setSelectedRow("");
    } else if (setFieldFn === setColumnFields) {
      setSelectedColumn("");
    } else if (setFieldFn === setValueFields) {
      setSelectedValue("");
    }
  };

  const renderFieldDropdown = (
    label,
    options,
    selected,
    setSelected,
    setFieldFn,
    currentFields,
    includeAggregation = false,
    aggregationTypeState = "",
    setAggregationTypeFn = () => {}
  ) => (
    <div style={styles.dropdownSection}>
      <label style={styles.label}>{label}</label>
      <select
        style={styles.select}
        value={selected || ""}
        onChange={(e) => {
          const field = e.target.value;
          setSelected(field); // Update the selected field
          addField(setFieldFn, currentFields, field); // Add the selected field to the list
        }}
      >
        <option value="" disabled>
          Add a field
        </option>
        {options
          .map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
      </select>
      <div style={styles.selectedFieldsContainer}>
        {currentFields.map((field) => (
          <div key={field} style={styles.selectedField}>
            {field}
            <button
              onClick={() => removeField(field, setFieldFn, currentFields)}
              style={styles.removeButton}
            >
              X
            </button>
          </div>
        ))}
      </div>
      {includeAggregation && (
        <div style={styles.aggregationSection}>
          <label style={styles.label}>Aggregate values using</label>
          <select
            style={styles.select}
            value={aggregationTypeState}
            onChange={(e) => setAggregationTypeFn(e.target.value)}
          >
            <option value="Sum">Sum</option>
            <option value="Average">Average</option>
            <option value="Count">Count</option>
          </select>
        </div>
      )}
    </div>
  );

  const aggregateData = (data, rowFields, columnFields, valueFields) => {
    const pivotData = {};
    const grandTotal = { row: {}, column: {} };

    data.forEach((row) => {
      const rowKey = rowFields.map((field) => row[field]).join(" | ");
      const columnKey = columnFields.map((field) => row[field]).join(" | ");

      if (!pivotData[rowKey]) pivotData[rowKey] = {};
      if (!pivotData[rowKey][columnKey]) pivotData[rowKey][columnKey] = 0;

      valueFields.forEach((valueField) => {
        const value = parseFloat(row[valueField]) || 0;
        pivotData[rowKey][columnKey] += value;

        // Update grand totals
        grandTotal.row[rowKey] = (grandTotal.row[rowKey] || 0) + value;
        grandTotal.column[columnKey] =
          (grandTotal.column[columnKey] || 0) + value;
      });
    });

    return { pivotData, grandTotal };
  };

  const aggregateHierarchicalData = (
    data,
    rowFields,
    columnFields,
    valueFields,
    aggregationType
  ) => {
    const pivotTree = {};
    const colSet = new Set();
    let grandSum = 0;
    let grandCount = 0;
    const colSums = {};
    const colCounts = {};

    data.forEach((row) => {
      const rowKeys = rowFields.map((field) => row[field]);
      const colKey = columnFields.map((field) => row[field]).join(" | ");
      colSet.add(colKey);

      let pointer = pivotTree;
      rowKeys.forEach((key, idx) => {
        if (!pointer[key]) {
          pointer[key] = {
            __sub__: {},
            __cols__: {},
            __sums__: {},
            __counts__: {},
          };
        }
        if (idx === rowKeys.length - 1) {
          valueFields.forEach((field) => {
            const val = parseFloat(row[field]) || 0;

            // Initialize
            pointer[key].__sums__[colKey] = (pointer[key].__sums__[colKey] || 0) + val;
            pointer[key].__counts__[colKey] = (pointer[key].__counts__[colKey] || 0) + 1;

            colSums[colKey] = (colSums[colKey] || 0) + val;
            colCounts[colKey] = (colCounts[colKey] || 0) + 1;

            grandSum += val;
            grandCount += 1;
          });
        }

        pointer = pointer[key].__sub__;
      });
    });

    // Compute averages or sums based on the selected type
    const finalizeTree = (node) => {
      node.__total__ = 0;
      Object.keys(node.__sums__ || {}).forEach((colKey) => {
        let value;
        if (aggregationType === "Average") {
          value = node.__sums__[colKey] / node.__counts__[colKey];
        } else if (aggregationType === "Sum") {
          value = node.__sums__[colKey];
        } else if (aggregationType === "Count") {
          value = node.__counts__[colKey];
        }
        node.__cols__[colKey] = value;
        node.__total__ += value;
      });

      Object.values(node.__sub__).forEach((child) => finalizeTree(child));
    };

    Object.values(pivotTree).forEach(finalizeTree);

    const colTotals = {};
    Array.from(colSet).forEach((colKey) => {
      if (aggregationType === "Average") {
        colTotals[colKey] = colSums[colKey] / colCounts[colKey];
      } else if (aggregationType === "Sum") {
        colTotals[colKey] = colSums[colKey];
      } else if (aggregationType === "Count") {
        colTotals[colKey] = colCounts[colKey];
      }
    });

    const grandTotal =
      aggregationType === "Average"
        ? grandSum / grandCount
        : aggregationType === "Sum"
        ? grandSum
        : grandCount;

    return {
      pivotTree,
      colKeys: Array.from(colSet),
      colTotals,
      grandTotal,
    };
  };

  const downloadExcel = () => {
    if (!pivotTableRef.current) return;

    const wb = utils.book_new();
    const ws = utils.table_to_sheet(pivotTableRef.current);
    utils.book_append_sheet(wb, ws, "Pivot Table");
    writeFile(wb, "pivot_table.xlsx");
  };

  const renderHierarchicalPivotTable = (aggregatedData, rowFields) => {
    const { pivotTree, colKeys, colTotals, grandTotal } = aggregatedData;
    if (!aggregatedData) return null;

    if (!colKeys || colKeys.length === 0) {
      return (
        <div style={styles.placeholderMessage}>
          No data to display for the current selections.
        </div>
      );
    }

    return (
      <table style={styles.pivotTable} ref={pivotTableRef}>
        <thead>
          <tr>
            <th style={styles.tableHeader}>
              {rowFields.length > 0 ? rowFields.join(" | ") : ""}
            </th>
            {colKeys.map((col) => (
              <th key={col} style={styles.tableHeader}>
                {col}
              </th>
            ))}
            <th style={styles.tableHeader}>Grand Total</th>
          </tr>
        </thead>
        <tbody>
          {renderHierarchicalRows(pivotTree, 0, colKeys)}
          <tr>
            <td style={styles.tableRowGrand}>Grand Total</td>
            {colKeys.map((col) => (
              <td key={col} style={styles.tableCellGrand}>
                {colTotals[col]?.toFixed(2) || ""}
              </td>
            ))}
            <td style={styles.tableCellGrand}>{grandTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  const showTable =
    rowFields.length > 0 && columnFields.length > 0 && valueFields.length > 0;

  const renderHierarchicalRows = (tree, level, colKeys) => {
    return Object.entries(tree).flatMap(([label, data]) => {
      const row = (
        <tr key={label + level}>
          <td style={{ ...styles.tableRow, paddingLeft: `${level * 20}px` }}>
            {label}
          </td>
          {colKeys.map((col) => (
            <td key={col} style={styles.tableCell}>
              {data.__cols__[col]?.toFixed(2) || ""}
            </td>
          ))}
          <td style={styles.tableCellGrand}>{data.__total__.toFixed(2)}</td>
        </tr>
      );
      const children = renderHierarchicalRows(data.__sub__, level + 1, colKeys);
      return [row, ...children];
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.pivotContainer}>
        <h2 style={styles.pivotTablePlaceholder}>PIVOT TABLE ({aggregationType})</h2>
        {showTable ? (
          <>
            {(() => {
              const aggregated = aggregateHierarchicalData(
                structuredData,
                rowFields,
                columnFields,
                valueFields,
                aggregationType
              );
              return renderHierarchicalPivotTable(aggregated, rowFields);
            })()}
            <button style={styles.downloadButton} onClick={downloadExcel}>
              Download as Excel
            </button>
          </>
        ) : (
          <div style={styles.placeholderMessage}>
            <h2 style={styles.placeholderMessage}>
              To Construct a Pivot table
            </h2>
            Select at least one field in each category (Row, Column, and Value).
          </div>
        )}
      </div>

      <div style={styles.selectorPane}>
        {renderFieldDropdown(
          "Row Fields",
          headers,
          selectedRow,
          setSelectedRow,
          setRowFields,
          rowFields
        )}
        {renderFieldDropdown(
          "Column Fields",
          headers,
          selectedColumn,
          setSelectedColumn,
          setColumnFields,
          columnFields
        )}
        {renderFieldDropdown(
          "Value Fields",
          headers,
          selectedValue,
          setSelectedValue,
          setValueFields,
          valueFields,
          true, // Include aggregation options
          aggregationType,
          setAggregationType
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    height: "100vh",
    width: "100%",
    backgroundColor: "#e0f7fa",
    overflow: "hidden",
  },
  pivotContainer: {
    flex: 1,
    padding: "20px",
    overflow: "auto",
    backgroundColor: "#fff",
    position: "relative", // For positioning the download button
  },
  pivotTablePlaceholder: {
    textAlign: "center",
    fontSize: "18px",
    color: "#888",
  },
  selectorPane: {
    width: "280px",
    padding: "20px",
    backgroundColor: "skyblue",
    borderLeft: "1px solid #ccc",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflowY: "auto",
  },
  dropdownSection: {
    marginBottom: "20px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "bold",
    marginBottom: "8px",
    color: "#333",
  },
  select: {
    width: "100%",
    padding: "8px",
    fontSize: "14px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  },
  selectedFieldsContainer: {
    marginTop: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  selectedField: {
    display: "flex",
    justifyContent: "space-between",
    backgroundColor: "White",
    padding: "4px 8px",
    borderRadius: "10px",
    fontSize: "14px",
    color: "Black",
  },
  removeButton: {
    background: "red",
    color: "#000080",
    border: "none",
    borderRadius: "12px",
    padding: "2px 6px",
    cursor: "pointer",
    fontSize: "10px",
  },
  pivotTable: {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: "#fff",
    fontSize: "13px",
  },
  tableHeader: {
    border: "1px solid #ccc",
    padding: "6px",
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
  },
  tableHeaderGrand: {
    border: "1px solid #ccc",
    padding: "6px",
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
  },
  tableRow: {
    border: "1px solid #ccc",
    padding: "6px",
    backgroundColor: "#fafafa",
    textAlign: "center",
  },
  tableRowGrand: {
    border: "1px solid #ccc",
    padding: "6px",
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
  },
  tableCell: {
    border: "1px solid #ccc",
    padding: "6px",
    textAlign: "center",
  },
  tableCellGrand: {
    border: "1px solid #ccc",
    padding: "6px",
    textAlign: "center",
    fontWeight: "bold",
    backgroundColor: "#f0f0f0",
  },
  placeholderMessage: {
    textAlign: "center",
    fontSize: "16px",
    color: "#888",
    paddingTop: "40px",
  },
  aggregationSection: {
    marginTop: "15px",
  },
  downloadButton: {
    backgroundColor: "#4CAF50",
    color: "white",
    padding: "10px 15px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    marginTop: "20px",
  },
};

export default GeneratingFields;