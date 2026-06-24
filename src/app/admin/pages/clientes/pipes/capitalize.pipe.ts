import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'capitalize',
    standalone: true,
})
export class CapitalizePipe implements PipeTransform {
    transform(value: string | undefined | null): string {
        if (!value) return '';
        return value
            .toLowerCase()
            .split(' ')
            .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
            .join(' ');
    }
}
