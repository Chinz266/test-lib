import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReadImg } from './read-img';

describe('ReadImg', () => {
  let component: ReadImg;
  let fixture: ComponentFixture<ReadImg>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadImg],
    }).compileComponents();

    fixture = TestBed.createComponent(ReadImg);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
