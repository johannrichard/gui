import {TaskRepository} from '../repository/task-repository';

export class TaskService {
    private static instance: TaskService;

    private constructor(private taskRepository: TaskRepository) {
    }

    public static getInstance() {
        if (!TaskService.instance) {
            TaskService.instance = new TaskService(TaskRepository.getInstance());
        }
        return TaskService.instance;
    }

    public loadEntries(): Promise<Array<Object> > {
        return this.taskRepository.listTasks();
    }

    public findTasks(filter: Object): Promise<Array <Object>> {
        return this.taskRepository.findTasks(filter);
    }

    public getTask(taskId: number): any {
        return this.taskRepository.getTask(taskId);
    }

    public abortTask(taskId: string): Promise<any> {
        return this.taskRepository.abortTask(taskId);
    }

}
