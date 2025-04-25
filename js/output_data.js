function exportTableToExcel(tableId, exportName) {
    // Get the table element
    console.log(1);
    const d = new Date().toLocaleString();
    console.log(2);
    // Create a new workbook object
    var workbook = XLSX.utils.book_new();
    console.log(3);
    // 1. Create Cover Sheet data
    var coverData = [
      [""],
      ["", `${exportName} Export`],
      [""],
      [
        "",
        `This report contains data related to ${projectName} and should be used appropriately`,
      ],
      [""],
      ["", "Generated on: " + d],
    ];
    console.log(4);
    // Convert cover data to worksheet
    var coverSheet = XLSX.utils.aoa_to_sheet(coverData);
    console.log(5);
  
    // Add the cover sheet to the workbook with a sheet name "Cover"
    XLSX.utils.book_append_sheet(workbook, coverSheet, "Cover");
    console.log(6);
    // 2. Add the Table Sheet
    var table = document.getElementById(tableId);
    console.log(7);
    // Convert the modified table data to a sheet
    var tableSheet = XLSX.utils.table_to_sheet(table);
    console.log(8);
    // Add the table sheet to the workbook with a sheet name "Data"
    XLSX.utils.book_append_sheet(workbook, tableSheet, "Data");
    console.log(9);
    // Use SheetJS to export the worksheet to an Excel file
    XLSX.writeFile(workbook, `${exportName}_${projectName}_${d}.xlsx`);
    console.log(10);
  }

  function exportDRPivotedDataToExcel() {
    // 1) Pivot the data so each file is a single row
    const pivotedData = pivotData(filteredData);
  
    // 2) Convert JSON to a worksheet
    const worksheet = XLSX.utils.json_to_sheet(pivotedData);
  
    // 3) Create a new workbook
    const workbook = XLSX.utils.book_new();
  
    // 4) Append the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pivoted Data");
  
    // 5) Write the file (downloads in the browser)
    XLSX.writeFile(workbook, `${projectName} - Drawing Register.xlsx`);
  }

  async function exportPivotedDataAsTable() {
    // 1. Pivot the data
    const pivotedData = pivotData(filteredData);
  
    // 2. Create a new ExcelJS Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Drawing Register');
  
    // 3. Define the columns for the table
    //    (The "name" property is what shows in Excel's header row;
    //     the "key" property is how we'll map data into rows.)
    const tableColumns = [
      { name: 'File Name',        filterButton: true, key: 'fileName'        },
      { name: 'File URL',         filterButton: true, key: 'fileURL'         },
      { name: 'File Description', filterButton: true, key: 'fileDescription' },
      { name: 'Title Line',       filterButton: true, key: 'titleLine'       },
      { name: 'Status',           filterButton: true, key: 'status'          },
      // You can add more columns dynamically based on the pivoted data
      // or predefine as needed (e.g. Rev1, Rev1 Issued, Rev2, Rev2 Issued, etc.)
    ];
  
    // Let’s figure out how many revision columns we might have
    // by scanning pivotedData for the max number of Revs.
    let maxRevs = 0;
    pivotedData.forEach(row => {
      const revKeys = Object.keys(row).filter(k => k.startsWith('Rev') && !k.endsWith('Issued'));
      maxRevs = Math.max(maxRevs, revKeys.length);
    });
  
    // Add the revision columns
    for (let i = 1; i <= maxRevs; i++) {
      tableColumns.push({ name: `Rev${i}`,         filterButton: true, key: `Rev${i}`         });
      tableColumns.push({ name: `Rev${i} Issued`, filterButton: true, key: `Rev${i} Issued` });
    }
  
    // 4. Build the rows array
    //    Each row is an array of values that match the "key" fields in tableColumns.
    //    Alternatively, we can let ExcelJS map the row object by key if we pass an object.
    const tableRows = pivotedData.map(item => {
      // Build an array of cell values in the same order as tableColumns
      return tableColumns.map(col => item[col.key] || '');
    });
  
    // 5. Add the table to the worksheet
    worksheet.addTable({
      name: 'Drawing_Register',
      ref: 'A1',            // Start cell for the table
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleLight2',  // or any built-in table style name
        showRowStripes: true
      },
      columns: tableColumns.map(col => ({ name: col.name, filterButton: col.filterButton })),
      rows: tableRows
    });
  
    // NOTE: If you prefer to let ExcelJS automatically map object fields by 'key',
    // you can add rows differently. But for a true "table" object with styling,
    // we typically specify columns/rows as above.
  
    // 6. Save the workbook to a file
    //    In Node:
    // await workbook.xlsx.writeFile('MyPivotedExport.xlsx');
  
    //    In a browser:
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName} - Drawing Register.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }
  