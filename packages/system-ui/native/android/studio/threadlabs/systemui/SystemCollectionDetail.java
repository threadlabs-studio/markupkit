package studio.threadlabs.systemui;

import android.content.Context;
import android.animation.Animator;
import android.animation.ObjectAnimator;
import android.os.Build;
import android.view.View;
import android.widget.FrameLayout;
import androidx.activity.BackEventCompat;
import androidx.slidingpanelayout.widget.SlidingPaneLayout;
import androidx.transition.Transition;
import androidx.transition.TransitionListenerAdapter;
import androidx.transition.TransitionManager;
import androidx.transition.TransitionSeekController;
import androidx.transition.TransitionValues;
import com.google.android.material.color.MaterialColors;
import java.util.Objects;
import java.util.function.Consumer;

/** Retained native panes. Only the application commits the active region and navigation. */
public final class SystemCollectionDetail extends FrameLayout implements AutoCloseable {
    public enum Region { COLLECTION, DETAIL }
    private Region active=Region.COLLECTION;
    private Consumer<Region> request;
    private boolean closed;
    private final ControlledPane panes;
    private final View detailPane;
    private TransitionSeekController backPreview;
    private long previewGeneration;
    private float backProgress;
    private boolean backRequested;
    private boolean reducedMotion;

    public SystemCollectionDetail(Context context,View collection,View detail,Consumer<Region> request) {
        super(context);this.request=Objects.requireNonNull(request);
        panes=new ControlledPane(context);
        panes.setLockMode(SlidingPaneLayout.LOCK_MODE_LOCKED);
        panes.addView(collection,new SlidingPaneLayout.LayoutParams(dp(280),-1));
        SlidingPaneLayout.LayoutParams detailLayout=new SlidingPaneLayout.LayoutParams(dp(360),-1);detailLayout.weight=1;
        panes.addView(detail,detailLayout);
        // The native detail container must be opaque for obscured collection controls to be hidden.
        detailPane=panes.getChildAt(1);
        detailPane.setBackgroundColor(MaterialColors.getColor(detailPane,com.google.android.material.R.attr.colorSurface));
        addView(panes,new FrameLayout.LayoutParams(-1,-1));
    }
    private int dp(int value) {return Math.round(value*getResources().getDisplayMetrics().density);}

    /** Publish the committed region on the UI thread; resizing itself never requests navigation. */
    public void render(Region active) {
        if(closed)throw new IllegalStateException("The collection/detail presentation is closed");
        Region previous=this.active;
        this.active=Objects.requireNonNull(active);
        if(backRequested&&backPreview!=null) {
            backRequested=false;
            if(!backPreview.isReady())resetBackPreview();
            else if(active==Region.COLLECTION)backPreview.animateToEnd();
            else cancelBackProgress();
        } else if(previous!=active)resetBackPreview();
        panes.applyActive();
    }
    /** Native progress is visual only. The shared application receives no request until invocation. */
    public void startBackProgress(BackEventCompat event) {
        Objects.requireNonNull(event);
        if(closed||active!=Region.DETAIL)return;
        resetBackPreview();
        if(reducedMotion||Build.VERSION.SDK_INT<34||!android.animation.ValueAnimator.areAnimatorsEnabled()||!isAttachedToWindow()||!panes.isSlideable())return;
        long generation=previewGeneration;
        BackTranslation transition=new BackTranslation();
        transition.addTarget(detailPane);
        transition.addListener(new TransitionListenerAdapter(){
            @Override public void onTransitionEnd(Transition value){if(generation==previewGeneration)resetBackPreview();}
        });
        backPreview=TransitionManager.controlDelayedTransition(panes,transition);
        if(backPreview==null)return;
        backProgress=event.getProgress();
        backPreview.addOnReadyListener(controller->{if(!closed&&generation==previewGeneration&&backPreview==controller)controller.setCurrentFraction(backProgress);});
        detailPane.setTranslationX(event.getSwipeEdge()==BackEventCompat.EDGE_LEFT?detailPane.getWidth():-detailPane.getWidth());
        panes.updateCollectionVisibility();
    }
    public void updateBackProgress(BackEventCompat event) {
        Objects.requireNonNull(event);
        if(closed||backPreview==null||backRequested)return;
        backProgress=Math.max(0,Math.min(1,event.getProgress()));
        if(backPreview.isReady())backPreview.setCurrentFraction(backProgress);
    }
    /** Apply resolved product/environment motion. False still delegates to native animation settings. */
    public void reducedMotion(boolean reduced) {
        if(closed)throw new IllegalStateException("The collection/detail presentation is closed");
        if(reducedMotion==reduced)return;
        reducedMotion=reduced;
        if(reduced)resetBackPreview();
    }
    /** Restore native presentation without changing region, draft, provider work or history. */
    public void cancelBackProgress() {
        if(closed)return;
        backRequested=false;
        TransitionSeekController controller=backPreview;
        if(controller==null||!controller.isReady()){resetBackPreview();return;}
        long generation=previewGeneration;
        controller.animateToStart(()->{if(generation==previewGeneration)resetBackPreview();});
    }
    private void resetBackPreview() {
        boolean hadPreview=backPreview!=null;
        backPreview=null;backRequested=false;previewGeneration++;
        if(hadPreview)TransitionManager.endTransitions(panes);
        detailPane.setTranslationX(0);
        panes.updateCollectionVisibility();
    }
    @Override protected void onSizeChanged(int width,int height,int oldWidth,int oldHeight) {
        super.onSizeChanged(width,height,oldWidth,oldHeight);
        if(oldWidth>0&&(width!=oldWidth||height!=oldHeight)&&backPreview!=null)resetBackPreview();
    }
    /** Connect native Back to this request. A dirty-leave decision can leave the region unchanged. */
    public boolean requestBack() {
        if(closed||active!=Region.DETAIL)return false;
        backRequested=backPreview!=null;
        request.accept(Region.COLLECTION);return true;
    }
    private static final class BackTranslation extends Transition {
        private static final String X="systemui:back:translationX";
        BackTranslation(){setInterpolator(new android.view.animation.LinearInterpolator());}
        @Override public boolean isSeekingSupported(){return true;}
        @Override public String[] getTransitionProperties(){return new String[]{X};}
        @Override public void captureStartValues(TransitionValues values){values.values.put(X,values.view.getTranslationX());}
        @Override public void captureEndValues(TransitionValues values){values.values.put(X,values.view.getTranslationX());}
        @Override public Animator createAnimator(android.view.ViewGroup root,TransitionValues start,TransitionValues end) {
            if(start==null||end==null)return null;
            return ObjectAnimator.ofFloat(end.view,View.TRANSLATION_X,(float)start.values.get(X),(float)end.values.get(X));
        }
    }
    private final class ControlledPane extends SlidingPaneLayout implements SlidingPaneLayout.PanelSlideListener {
        ControlledPane(Context context) {super(context);addPanelSlideListener(this);}
        void applyActive() {
            if(closed)return;
            if(active==Region.DETAIL)openPane();else closePane();
        }
        @Override protected void onLayout(boolean changed,int left,int top,int right,int bottom) {
            // SlidingPaneLayout applies its preserved compact state during first/width-change layout.
            applyActive();super.onLayout(changed,left,top,right,bottom);updateCollectionVisibility();
        }
        private void updateCollectionVisibility() {
            if(!closed)getChildAt(0).setVisibility(backPreview==null&&isSlideable()&&isOpen()?INVISIBLE:VISIBLE);
        }
        @Override protected void dispatchDraw(android.graphics.Canvas canvas) {
            // SlidingPaneLayout clips its first child against layout bounds, ignoring our seeked translation.
            if(backPreview!=null) {
                View collection=getChildAt(0);
                int saved=canvas.save();
                canvas.translate(collection.getLeft(),collection.getTop());
                canvas.concat(collection.getMatrix());
                collection.draw(canvas);
                canvas.restoreToCount(saved);
            }
            super.dispatchDraw(canvas);
        }
        // AndroidX 1.2 updates obscured visibility at first layout and panel close, but not open.
        @Override public void onPanelSlide(View panel,float offset) {updateCollectionVisibility();}
        @Override public void onPanelOpened(View panel) {updateCollectionVisibility();}
        @Override public void onPanelClosed(View panel) {updateCollectionVisibility();}
    }
    /** Disconnect this composition; the host still owns the child presenters and shared model. */
    @Override public void close() {if(closed)return;resetBackPreview();closed=true;request=null;panes.removePanelSlideListener(panes);}
}
