import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

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
  };

  const renderFieldDropdown = (
    label,
    options,
    selected,
    setSelected,
    setFieldFn,
    currentFields
  ) => (
    <div style={styles.dropdownSection}>
      <label style={styles.label}>{label}</label>
      <select
        style={styles.select}
        value={selected}
        onChange={(e) => {
          const field = e.target.value;
          setSelected(field); // Update the selected field
          addField(setFieldFn, currentFields, field); // Add the selected field to the list
        }}
      >
        <option value="" disabled>
          Add a field
        </option>
        {headers
          .filter((field) => !currentFields.includes(field))
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
    let grandTotal = 0;
    const colTotals = {};
    const counts = {};
    data.forEach((row) => {
      const rowKeys = rowFields.map((field) => row[field]);
      const colKey = columnFields.map((field) => row[field]).join(" | ");
      colSet.add(colKey);

      let pointer = pivotTree;
      rowKeys.forEach((key, idx) => {
        if (!pointer[key])
          pointer[key] = { __sub__: {}, __total__: 0, __cols__: {} };
        if (idx === rowKeys.length - 1) {
          valueFields.forEach((field) => {
            const rawVal = row[field];
            const val = parseFloat(rawVal) || 0;
            const countKey = rowKeys.join(" | ") + "||" + colKey;
  
            if (aggregationType === "Count") {
              pointer[key].__cols__[colKey] =
                (pointer[key].__cols__[colKey] || 0) + 1;
              colTotals[colKey] = (colTotals[colKey] || 0) + 1;
              pointer[key].__total__ += 1;
              grandTotal += 1;
            } else {
              pointer[key].__cols__[colKey] =
                (pointer[key].__cols__[colKey] || 0) + val;
              colTotals[colKey] = (colTotals[colKey] || 0) + val;
              pointer[key].__total__ += val;
              grandTotal += val;
  
              if (aggregationType === "Average") {
                counts[countKey] = (counts[countKey] || 0) + 1;
              }
            }
          });
        }
        pointer = pointer[key].__sub__
      });
    });

    if (aggregationType === "Average") {
      Object.entries(pivotTree).forEach(function applyAverage([label, node]) {
        const applyToNode = (node, rowPrefix) => {
          Object.entries(node.__cols__).forEach(([col, sum]) => {
            const countKey = rowPrefix + "||" + col;
            const count = counts[countKey] || 1;
            node.__cols__[col] = sum / count;
          });
  
          Object.values(node.__sub__).forEach((sub, idx) => {
            applyToNode(sub, rowPrefix + " | " + Object.keys(node.__sub__)[idx]);
          });
        };
  
        applyToNode(node, label);
      });
  
      // Average totals
      Object.keys(colTotals).forEach((col) => {
        let total = 0;
        let count = 0;
        Object.entries(counts).forEach(([key, c]) => {
          if (key.endsWith("||" + col)) {
            total += colTotals[col];
            count += c;
          }
        });
        colTotals[col] = count ? colTotals[col] / count : 0;
      });
  
      grandTotal = Object.values(colTotals).reduce((a, b) => a + b, 0);
    }

    return {
      pivotTree,
      colKeys: Array.from(colSet),
      colTotals,
      grandTotal,
    };
  };

  // const renderPivotTable = (aggregatedData, rowFields) => {
  //   const { pivotData, grandTotal } = aggregatedData;
  //   const rowKeys = Object.keys(pivotData);
  //   const colKeys = [
  //     ...new Set(rowKeys.flatMap((row) => Object.keys(pivotData[row]))),
  //   ];

  //   return (
  //     <table style={styles.pivotTable}>
  //       <thead>
  //         <tr>
  //           <th style={styles.tableHeader}>
  //             {rowFields.length > 0 ? rowFields.join(' | ') : ''}
  //           </th>
  //           {colKeys.map((col) => (
  //             <th key={col} style={styles.tableHeader}>
  //               {col}
  //             </th>
  //           ))}
  //           <th style={styles.tableHeader}>Grand Total</th>
  //         </tr>
  //       </thead>
  //       <tbody>
  //         {rowKeys.map((row) => (
  //           <tr key={row}>
  //             <td style={styles.tableRow}>{row}</td>
  //             {colKeys.map((col) => (
  //               <td key={col} style={styles.tableCell}>
  //                 {pivotData[row][col]?.toFixed(2) || 0}
  //               </td>
  //             ))}
  //             <td style={styles.tableCellGrand}>
  //               {grandTotal.row[row]?.toFixed(2) || 0}
  //             </td>
  //           </tr>
  //         ))}
  //         <tr>
  //           <td style={styles.tableRowGrand}>Grand Total</td>
  //           {colKeys.map((col) => (
  //             <td key={col} style={styles.tableCellGrand}>
  //               {grandTotal.column[col]?.toFixed(2) || 0}
  //             </td>
  //           ))}
  //           <td style={styles.tableCellGrand}>
  //             {Object.values(grandTotal.row).reduce((a, b) => a + b, 0.0).toFixed(2)}
  //           </td>
  //         </tr>
  //       </tbody>
  //     </table>
  //   );
  // };

  const renderHierarchicalPivotTable = (aggregatedData, rowFields) => {
    const { pivotTree, colKeys, colTotals, grandTotal } = aggregatedData;
    if (!aggregatedData || !aggregatedData.colKeys) return null;

    return (
      <table style={styles.pivotTable}>
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
        {/* Placeholder for Pivot Table */}
        {/* <div style={styles.pivotTablePlaceholder}> */}
        <h2 style={styles.pivotTablePlaceholder}>PIVOT TABLE</h2>
        {showTable ? (
          (() => {
            const aggregated = aggregateHierarchicalData(
              structuredData,
              rowFields,
              columnFields,
              valueFields,
              aggregationType
            );
            return renderHierarchicalPivotTable(aggregated, rowFields);
          })()
        ) : (
          <div style={styles.placeholderMessage}>
            <h2 style={styles.placeholderMessage}>
              To Construct a Pivot table
            </h2>
            Select at least one field in each category (Row, Column, and Value).
          </div>
        )}

        {/* </div> */}
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
          valueFields
        )}
      </div>
      <div style={styles.dropdownSection}>
        <label style={styles.label}>Aggregate values using</label>
        <select
          style={styles.select}
          value={aggregationType}
          onChange={(e) => setAggregationType(e.target.value)}
        >
          <option value="Sum">Sum</option>
          <option value="Average">Average</option>
          <option value="Count">Count</option>
        </select>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    height: "100vh",
    width: "100%",
    //boxSizing: 'border-box',
    backgroundColor: "#e0f7fa",
    overflow: "hidden", // Light sky blue background for the page
  },
  pivotContainer: {
    flex: 1,
    padding: "20px",
    overflow: "auto",
    backgroundColor: "#fff",
    //borderRight: '1px solid #ccc',
  },
  pivotTablePlaceholder: {
    textAlign: "center",
    fontSize: "18px",
    color: "#888",
  },
  selectorPane: {
    width: "280px", // Slightly wider width for a more spacious layout
    padding: "20px",
    backgroundColor: "skyblue", // Grey color for the fields pane
    borderLeft: "1px solid #ccc",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflowY: "auto",
  },
  dropdownSection: {
    marginBottom: "20px", // Increased margin for better spacing
  },
  label: {
    fontSize: "14px",
    fontWeight: "bold",
    marginBottom: "8px", // Slightly more spacing
    color: "#333",
  },
  select: {
    width: "100%",
    padding: "8px", // Slightly more padding for better appearance
    //marginTop: '5px',
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
    backgroundColor: "White", // Light grey for selected fields
    padding: "4px 8px", // Smaller padding for a compact look
    borderRadius: "10px", // Rounded corners for the selected fields
    fontSize: "14px",
    color: "Black",
  },
  removeButton: {
    background: "red", // Bright white background for the 'x'
    color: "#000080",
    border: "none",
    borderRadius: "12px", // More rectangular pill style with rounded corners
    padding: "2px 6px", // Smaller padding to make it more compact
    cursor: "pointer",
    fontSize: "10px", // Smaller font size for the pills
    //alignSelf: 'center',
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
};

export default GeneratingFields;
