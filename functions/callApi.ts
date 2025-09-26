export async function callApi(method: string, filter: {}, select: string[] | null, entityTypeId: number | null, batchNumber: number, parsed: number): Promise<any[]> {
    let total: number = 0;
    const maxTotal: number = 50;
    let data: any = [];
    
    // Определяем параметры в зависимости от метода
    let params: any = {};

    if (method === "task.elapseditem.getlist" && !Array.isArray(entityTypeId)) {
        // Специфичные параметры для task.elapseditem.getlist
        params = {
            TASKID: entityTypeId || null,
            ORDER: { 'ID': 'desc' },
            FILTER: {">ID": 0},
            SELECT: select || [],
            start: 0
        };
    } else {
        // Стандартные параметры для других методов
        params = {
            filter: filter ? filter : null,
            select: select ? select : null,
            entityTypeId: entityTypeId ? entityTypeId : null,
            id: method === "crm.dealcategory.stage.list" ? entityTypeId : null,
            start: 0,
        };
    }

    const exceptions: string[] = ["crm.status.list"];
if(!Array.isArray(entityTypeId)){
    await new Promise((resolve) => {
        // @ts-ignore
        BX24.callMethod(method, params, (res: any) => {
            if (res.data()) {
                total = res.total();
                data = res.data();
                parsed += total;
                resolve(data);
            }
        });
    });
}

    if ((total > maxTotal && !exceptions.includes(method)) || Array.isArray(entityTypeId)) {
        let cmd = {};
        let iterations: number = Math.min(Math.ceil((total - batchNumber * 2500) / maxTotal), 50);
        if(iterations === 0){
          iterations = entityTypeId.length;
        }
        let resultData: any[] = [];

        for (let i: number = 0; i < iterations; i++) {
            const key: string = `cmd${i}`;
            
            let batchParams: any = {};
            
            if (method === "task.elapseditem.getlist") {
                batchParams = {
                    TASKID: entityTypeId[i] || null,
                    ORDER: { 'ID': 'desc' },
                    FILTER: {">ID": 0},
                    SELECT: select || [],
                };
            } else {
                batchParams = {
                    filter: filter || null,
                    select: select || null,
                    entityTypeId: entityTypeId || null,
                    id: method === "crm.dealcategory.stage.list" ? entityTypeId : null,
                    start: (batchNumber * 2500) + i * maxTotal,
                };
            }

            const value = {
                method: method,
                params: batchParams
            };
            
            cmd[key] = value;
            
            if ((i + 1) % maxTotal === 0 || i + 1 === iterations) {
                const batchLength: number = (i + 1) % maxTotal === 0 ? maxTotal : iterations % maxTotal;
                
                await new Promise((resolve: any) => {
                    // @ts-ignore
                    BX24.callBatch(cmd, (res: any) => {
                        for (let r: number = i - batchLength + 1; r < i + 1; r++) {
                            const key: string = `cmd${r}`;
                            const batchData = res[key].data();
                            const processedData = batchData.items ? batchData.items : batchData;
                            resultData.push(processedData);
                        }
                        if(!Array.isArray(entityTypeId)){
                            resultData = resultData.flat();
                        }
                        
                        data = resultData;
                        cmd = {};
                        resolve();
                    });
                });
                
                break;
            }
        }
    }
    
    return data.items ? data.items : data;
}

// Пример использования нового метода
export async function getTaskElapsedItems(taskId: any, order: object = {'ID': 'desc'}, filter: object = {}, select: string[] = []): Promise<any[]> {
    return callApi('task.elapseditem.getlist', order, select, taskId, 0, 0);
}